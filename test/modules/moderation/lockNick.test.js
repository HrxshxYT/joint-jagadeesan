import { describe, it, expect, vi } from "vitest";
import lockdown from "../../../src/modules/moderation/commands/lockdown.js";
import unlock from "../../../src/modules/moderation/commands/unlock.js";
import nick from "../../../src/modules/moderation/commands/nick.js";

function channel() {
  return { permissionOverwrites: { edit: vi.fn(async () => {}) } };
}
function guildWith(member) {
  return {
    roles: { everyone: { id: "everyone" } },
    ownerId: "owner",
    members: {
      me: { id: "bot", roles: { highest: { position: 100 } } },
      fetch: vi.fn(async () => member),
    },
  };
}

describe("/lockdown", () => {
  it("denies SendMessages for @everyone", async () => {
    const ch = channel();
    const g = guildWith(null);
    const i = { channel: ch, guild: g, options: { getString: () => null }, reply: vi.fn(async () => {}) };
    await lockdown.execute(i, { logger: { error: vi.fn() } });
    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith(
      { id: "everyone" },
      { SendMessages: false },
    );
  });
});

describe("/unlock", () => {
  it("clears the SendMessages override", async () => {
    const ch = channel();
    const g = guildWith(null);
    const i = { channel: ch, guild: g, reply: vi.fn(async () => {}) };
    await unlock.execute(i, { logger: { error: vi.fn() } });
    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith(
      { id: "everyone" },
      { SendMessages: null },
    );
  });
});

describe("/nick", () => {
  it("sets a member's nickname when hierarchy allows", async () => {
    const member = {
      id: "t1",
      roles: { highest: { position: 3 } },
      guild: { ownerId: "owner" },
      setNickname: vi.fn(async () => {}),
    };
    const g = guildWith(member);
    const i = {
      guild: g,
      user: { id: "mod1" },
      member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
      options: { getUser: () => ({ id: "t1" }), getString: () => "NewName" },
      reply: vi.fn(async () => {}),
    };
    await nick.execute(i, { logger: { error: vi.fn() } });
    expect(member.setNickname).toHaveBeenCalledWith("NewName", expect.any(String));
  });
});
