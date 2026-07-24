import { describe, it, expect, vi } from "vitest";
import { ChannelType, GuildVerificationLevel, PermissionsBitField } from "discord.js";
import { LockdownService } from "../../../src/modules/lockdown/LockdownService.js";

// In-memory prisma double for LockdownState/LockdownSnapshot.
function fakePrisma(seed = {}) {
  const states = new Map(); // guildId -> state (with snapshots array)
  if (seed.state) states.set(seed.state.guildId, seed.state);
  let idc = 0;
  return {
    _states: states,
    lockdownState: {
      findUnique: vi.fn(async ({ where }) => {
        const s = where.guildId
          ? states.get(where.guildId)
          : [...states.values()].find((x) => x.id === where.id);
        return s ?? null;
      }),
      findMany: vi.fn(async ({ where }) => {
        return [...states.values()].filter(
          (s) =>
            s.status === (where.status ?? s.status) &&
            (!where.expiresAt || (s.expiresAt && s.expiresAt <= where.expiresAt.lte)),
        );
      }),
      create: vi.fn(async ({ data }) => {
        const state = { id: `L${++idc}`, snapshots: [], ...data };
        states.set(data.guildId, state);
        return state;
      }),
      update: vi.fn(async ({ where, data }) => {
        const s = [...states.values()].find((x) => x.id === where.id) ?? states.get(where.guildId);
        Object.assign(s, data);
        return s;
      }),
    },
    lockdownSnapshot: {
      createMany: vi.fn(async ({ data }) => {
        const s = [...states.values()].find((x) => x.id === data[0]?.lockdownId);
        if (s) s.snapshots.push(...data);
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const s = [...states.values()].find((x) => x.id === where.lockdownId);
        if (s) s.snapshots = [];
        return { count: 0 };
      }),
    },
  };
}

function fakeCases() {
  let n = 0;
  return { createCase: vi.fn(async (d) => ({ caseNumber: ++n, ...d })) };
}

function textChannel(id, editImpl) {
  return {
    id,
    type: ChannelType.GuildText,
    permissionOverwrites: {
      cache: new Map(),
      edit: editImpl ?? vi.fn(async () => {}),
    },
  };
}

function fakeGuild({ id = "g1", channels = [] } = {}) {
  const everyone = {
    id: "everyone",
    permissions: new PermissionsBitField(PermissionsBitField.Flags.SendMessages),
    setPermissions: vi.fn(async () => {}),
  };
  const cache = new Map(channels.map((c) => [c.id, c]));
  return {
    id,
    features: [],
    verificationLevel: GuildVerificationLevel.Low,
    roles: { everyone, cache: new Map([["everyone", everyone]]) },
    channels: { cache },
    setVerificationLevel: vi.fn(async () => {}),
    disableInvites: vi.fn(async () => {}),
  };
}

describe("LockdownService", () => {
  it("channels lock persists state + snapshots and creates a case", async () => {
    const prisma = fakePrisma();
    const cases = fakeCases();
    const svc = new LockdownService({ prisma, logger: console, cases });
    const guild = fakeGuild({ channels: [textChannel("c1")] });

    const res = await svc.start({
      guild,
      tier: "channels",
      reason: "raid",
      actorId: "admin",
      modRoleIds: [],
    });

    expect(res.ok).toBe(true);
    expect(prisma.lockdownState.create).toHaveBeenCalled();
    expect(prisma.lockdownSnapshot.createMany).toHaveBeenCalled();
    const state = prisma._states.get("g1");
    expect(state.snapshots.some((s) => s.channelId === "c1")).toBe(true);
    expect(cases.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "lockdown", targetId: "admin" }),
    );
  });

  it("is idempotent: a second start while active does not re-snapshot", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const guild = fakeGuild({ channels: [textChannel("c1")] });
    await svc.start({ guild, tier: "channels", reason: "r", actorId: "a", modRoleIds: [] });

    prisma.lockdownSnapshot.createMany.mockClear();
    const second = await svc.start({
      guild,
      tier: "channels",
      reason: "r",
      actorId: "a",
      modRoleIds: [],
    });

    expect(second.ok).toBe(false);
    expect(second.alreadyActive).toBe(true);
    expect(prisma.lockdownSnapshot.createMany).not.toHaveBeenCalled();
  });

  it("restores exactly from DB after a simulated restart (no in-memory state)", async () => {
    // Pre-seed a persisted lockdown as if the process just restarted.
    const editSpy = vi.fn(async () => {});
    const guild = fakeGuild({ channels: [textChannel("c1", editSpy)] });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshotCount: 1,
        snapshots: [
          {
            targetType: "channel",
            channelId: "c1",
            targetId: "everyone",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false, // was neutral
            addedByUs: false,
          },
        ],
      },
    });
    const cases = fakeCases();
    const svc = new LockdownService({ prisma, logger: console, cases });

    const res = await svc.unlock({ guild, actorId: "admin" });

    expect(res.ok).toBe(true);
    // neutral restored to null, NOT allow
    expect(editSpy).toHaveBeenCalledWith(
      "everyone",
      { SendMessages: null },
      { reason: "Lockdown lifted" },
    );
    expect(prisma.lockdownState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lifted" }) }),
    );
    expect(cases.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "unlockserver" }),
    );
  });

  it("unlock lifts cleanly when the tier locked zero targets", async () => {
    // A bare voice/channels lockdown on a guild with no matching channels legitimately
    // takes zero snapshots — this must NOT be mistaken for corruption.
    const guild = fakeGuild();
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "voice",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshotCount: 0,
        snapshots: [],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });

    const res = await svc.unlock({ guild, actorId: "admin" });

    expect(res.ok).toBe(true);
    expect(res.reason).not.toBe("corrupt");
    expect(prisma.lockdownState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lifted" }) }),
    );
  });

  it("refuses to unlock when there is no active lockdown", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const res = await svc.unlock({ guild: fakeGuild(), actorId: "a" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("none");
  });

  it("refuses to unlock a corrupt snapshot set instead of guessing", async () => {
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        snapshotCount: 2,
        snapshots: [],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const res = await svc.unlock({ guild: fakeGuild(), actorId: "a" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("corrupt");
    // state left intact for the admin to inspect
    expect(prisma.lockdownState.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lifted" }) }),
    );
  });

  it("partial-failure unlock restores the good channel and keeps snapshots", async () => {
    const goodEdit = vi.fn(async () => {});
    const badEdit = vi.fn(async () => {
      throw new Error("Missing Permissions");
    });
    const guild = fakeGuild({
      channels: [textChannel("good", goodEdit), textChannel("bad", badEdit)],
    });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshotCount: 2,
        snapshots: [
          {
            targetType: "channel",
            channelId: "good",
            targetId: "everyone",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false,
            addedByUs: false,
          },
          {
            targetType: "channel",
            channelId: "bad",
            targetId: "everyone",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false,
            addedByUs: false,
          },
        ],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });

    const res = await svc.unlock({ guild, actorId: "admin" });

    expect(goodEdit).toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("partial");
    expect(res.failed).toHaveLength(1);
    // partial failure -> snapshots NOT deleted, still restorable
    expect(prisma.lockdownSnapshot.deleteMany).not.toHaveBeenCalled();
    // status kept "active" so the admin can re-run /unlockserver
    expect(prisma.lockdownState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }),
    );
  });

  it("staff-bypass allow is removed on unlock only where addedByUs", async () => {
    const editSpy = vi.fn(async () => {});
    const guild = fakeGuild({ channels: [textChannel("c1", editSpy)] });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshots: [
          {
            targetType: "channel",
            channelId: "c1",
            targetId: "everyone",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false,
            addedByUs: false,
          },
          {
            targetType: "channel",
            channelId: "c1",
            targetId: "modAdded",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false,
            addedByUs: true,
          },
          {
            targetType: "channel",
            channelId: "c1",
            targetId: "modHad",
            field: "SendMessages",
            priorAllow: true,
            priorDeny: false,
            addedByUs: false,
          },
        ],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    await svc.unlock({ guild, actorId: "admin" });

    // addedByUs -> restored to null (removed)
    expect(editSpy).toHaveBeenCalledWith(
      "modAdded",
      { SendMessages: null },
      { reason: "Lockdown lifted" },
    );
    // pre-existing allow -> restored to allow (kept)
    expect(editSpy).toHaveBeenCalledWith(
      "modHad",
      { SendMessages: true },
      { reason: "Lockdown lifted" },
    );
  });

  it("panic() starts a panic-tier lockdown", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const guild = fakeGuild({ channels: [textChannel("c1")] });

    const res = await svc.panic(guild, { reason: "raid", actorId: "admin" });

    expect(res.ok).toBe(true);
    const state = prisma._states.get("g1");
    expect(state.tier).toBe("panic");
  });
});
