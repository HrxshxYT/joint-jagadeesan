import { describe, it, expect, vi } from "vitest";
import {
  ChannelType,
  GuildVerificationLevel,
  PermissionsBitField,
  PermissionFlagsBits,
} from "discord.js";
import {
  applyPanic,
  applyChannels,
  applyVoice,
  applyInvites,
  applyJoins,
} from "../../../src/modules/lockdown/tiers.js";
import { restoreRow } from "../../../src/modules/lockdown/snapshot.js";

function everyoneRole() {
  return {
    id: "everyone",
    permissions: new PermissionsBitField(PermissionFlagsBits.SendMessages),
    setPermissions: vi.fn(async () => {}),
  };
}

// `overwrites` mirrors snapshot.test.js's fakeChannel style: a map of
// holderId -> { allow, deny } bitfield resolvables, pre-seeding the
// channel's permissionOverwrites.cache so tests can assert against an
// already-existing explicit overwrite.
function textChannel(id, overwrites = {}) {
  const cache = new Map();
  for (const [holderId, { allow = 0n, deny = 0n } = {}] of Object.entries(overwrites)) {
    cache.set(holderId, {
      id: holderId,
      allow: new PermissionsBitField(allow),
      deny: new PermissionsBitField(deny),
    });
  }
  return {
    id,
    type: ChannelType.GuildText,
    permissionOverwrites: { cache, edit: vi.fn(async () => {}) },
  };
}

function voiceChannel(id) {
  return {
    id,
    type: ChannelType.GuildVoice,
    permissionOverwrites: { cache: new Map(), edit: vi.fn(async () => {}) },
  };
}

function fakeGuild({ channels = [], everyone = everyoneRole(), features = [] } = {}) {
  const chCache = new Map(channels.map((c) => [c.id, c]));
  return {
    features,
    verificationLevel: GuildVerificationLevel.Low,
    roles: { everyone, cache: new Map([["everyone", everyone]]) },
    channels: { cache: chCache },
    setVerificationLevel: vi.fn(async () => {}),
    disableInvites: vi.fn(async () => {}),
  };
}

describe("tiers", () => {
  it("panic strips SendMessages from @everyone and snapshots the prior bit", async () => {
    const guild = fakeGuild();
    const res = await applyPanic(guild, { reason: "raid" });
    expect(guild.roles.everyone.setPermissions).toHaveBeenCalled();
    expect(res.snapshots).toEqual([
      {
        targetType: "role",
        channelId: null,
        targetId: "everyone",
        field: "SendMessages",
        priorAllow: true,
        priorDeny: false,
        addedByUs: false,
      },
    ]);
  });

  it("channels denies @everyone and adds a staff-bypass allow flagged addedByUs", async () => {
    const c1 = textChannel("c1");
    const guild = fakeGuild({ channels: [c1] });
    const res = await applyChannels(guild, {
      channelIds: ["c1"],
      modRoleIds: ["mod"],
      reason: "raid",
    });

    // @everyone denied
    expect(c1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone",
      { SendMessages: false },
      { reason: "raid" },
    );
    // mod role allowed
    expect(c1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "mod",
      { SendMessages: true },
      { reason: "raid" },
    );
    // staff-bypass snapshot is flagged addedByUs (prior was neutral)
    const modSnap = res.snapshots.find((s) => s.targetId === "mod");
    expect(modSnap.addedByUs).toBe(true);
    expect(res.failed).toEqual([]);
  });

  it("channels leaves addedByUs false when the mod role already had an explicit allow", async () => {
    // Mod role already has an explicit SendMessages allow before the lockdown runs.
    const c1 = textChannel("c1", {
      mod: { allow: PermissionFlagsBits.SendMessages },
    });
    const guild = fakeGuild({ channels: [c1] });
    const res = await applyChannels(guild, {
      channelIds: ["c1"],
      modRoleIds: ["mod"],
      reason: "raid",
    });

    const modSnap = res.snapshots.find((s) => s.targetId === "mod");
    expect(modSnap.priorAllow).toBe(true);
    expect(modSnap.addedByUs).toBe(false);
  });

  it("voice denies @everyone and adds a staff-bypass allow for Connect and Speak", async () => {
    const v1 = voiceChannel("v1");
    const guild = fakeGuild({ channels: [v1] });
    const res = await applyVoice(guild, {
      channelIds: ["v1"],
      modRoleIds: ["mod"],
      reason: "raid",
    });

    // @everyone denied on both fields
    expect(v1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone",
      { Connect: false, Speak: false },
      { reason: "raid" },
    );
    // mod role allowed on both fields
    expect(v1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "mod",
      { Connect: true, Speak: true },
      { reason: "raid" },
    );
    expect(res.failed).toEqual([]);
  });

  it("channels records a failure but keeps other channels", async () => {
    const good = textChannel("good");
    const bad = textChannel("bad");
    bad.permissionOverwrites.edit = vi.fn(async () => {
      throw new Error("Missing Permissions");
    });
    const guild = fakeGuild({ channels: [good, bad] });
    const res = await applyChannels(guild, {
      channelIds: ["good", "bad"],
      modRoleIds: [],
      reason: "raid",
    });
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].item).toBe("bad");
    expect(res.snapshots.some((s) => s.channelId === "good")).toBe(true);
  });

  it("invites pauses only if not already paused", async () => {
    const off = fakeGuild({ features: [] });
    expect((await applyInvites(off, { reason: "x" })).invitesPausedByUs).toBe(true);
    expect(off.disableInvites).toHaveBeenCalledWith(true);

    const already = fakeGuild({ features: ["INVITES_DISABLED"] });
    expect((await applyInvites(already, { reason: "x" })).invitesPausedByUs).toBe(false);
    expect(already.disableInvites).not.toHaveBeenCalled();
  });

  it("joins raises verification to VeryHigh and records prior", async () => {
    const guild = fakeGuild();
    const res = await applyJoins(guild, { reason: "x" });
    expect(res.priorVerificationLevel).toBe(GuildVerificationLevel.Low);
    expect(guild.setVerificationLevel).toHaveBeenCalledWith(GuildVerificationLevel.VeryHigh, "x");
  });

  // --- Role snapshot round-trip coverage (carry-forward from Task 2 review) ---
  //
  // Task 2's restoreRow role branch and snapshotRolePerm shipped with zero test
  // coverage. applyPanic is what actually produces role snapshots, so verify
  // here that the shape applyPanic returns round-trips correctly through
  // restoreRow for both the priorAllow:true and priorAllow:false cases -- this
  // exercises the PermissionsBitField#add/#remove -> setPermissions contract.
  it("panic snapshot round-trips through restoreRow when the bit was present (priorAllow:true)", async () => {
    const everyone = everyoneRole(); // has SendMessages set
    const guild = fakeGuild({ everyone });

    const { snapshots } = await applyPanic(guild, { reason: "raid" });
    const snap = snapshots[0];
    expect(snap.priorAllow).toBe(true);

    // Unlock: restoreRow should re-add the bit and call setPermissions again.
    everyone.setPermissions.mockClear();
    await restoreRow(guild, snap, "unlock");

    expect(everyone.setPermissions).toHaveBeenCalledTimes(1);
    const [restoredBits, reason] = everyone.setPermissions.mock.calls[0];
    expect(reason).toBe("unlock");
    // The bit should be re-added in the restored permission set.
    const restored = new PermissionsBitField(restoredBits);
    expect(restored.has(PermissionFlagsBits.SendMessages)).toBe(true);
  });

  it("panic snapshot round-trips through restoreRow when the bit was already absent (priorAllow:false)", async () => {
    const everyone = {
      id: "everyone",
      permissions: new PermissionsBitField(0n), // SendMessages already absent
      setPermissions: vi.fn(async () => {}),
    };
    const guild = fakeGuild({ everyone });

    const { snapshots } = await applyPanic(guild, { reason: "raid" });
    const snap = snapshots[0];
    expect(snap.priorAllow).toBe(false);

    // Unlock: restoreRow should call setPermissions but the bit stays removed.
    everyone.setPermissions.mockClear();
    await restoreRow(guild, snap, "unlock");

    expect(everyone.setPermissions).toHaveBeenCalledTimes(1);
    const [restoredBits, reason] = everyone.setPermissions.mock.calls[0];
    expect(reason).toBe("unlock");
    const restored = new PermissionsBitField(restoredBits);
    expect(restored.has(PermissionFlagsBits.SendMessages)).toBe(false);
  });
});
