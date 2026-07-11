import { describe, it, expect, vi } from "vitest";
import mute from "../../../src/modules/moderation/commands/mute.js";
import unmute from "../../../src/modules/moderation/commands/unmute.js";

function ctx({ muteRoleId = "mute1" } = {}) {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ muteRoleId, dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}
function makeMember() {
  return {
    id: "t1",
    roles: { highest: { position: 3 }, add: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    guild: { ownerId: "owner" },
  };
}
function interaction(member, opts = {}) {
  return {
    guildId: "g1",
    guild: {
      name: "T",
      ownerId: "owner",
      members: {
        me: { id: "bot", roles: { highest: { position: 100 } } },
        fetch: vi.fn(async () => member),
      },
    },
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
  };
}

describe("/mute", () => {
  it("adds the mute role and records a case", async () => {
    const c = ctx();
    const member = makeMember();
    await mute.execute(interaction(member, { reason: "spam" }), c);
    expect(member.roles.add).toHaveBeenCalledWith("mute1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "mute" }));
  });

  it("errors when no mute role is configured", async () => {
    const c = ctx({ muteRoleId: null });
    const member = makeMember();
    const i = interaction(member);
    await mute.execute(i, c);
    expect(member.roles.add).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("/unmute", () => {
  it("removes the mute role and records a case", async () => {
    const c = ctx();
    const member = makeMember();
    await unmute.execute(interaction(member), c);
    expect(member.roles.remove).toHaveBeenCalledWith("mute1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "unmute" }));
  });
});
