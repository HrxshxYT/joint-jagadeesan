import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/automod/events/messageCreate.js";
import { AutomodState } from "../../../src/modules/automod/AutomodState.js";

function ctx(config) {
  return {
    config: { getGuild: vi.fn(async () => ({ automod: config })) },
    cases: { createCase: vi.fn(async () => ({})) },
    automod: new AutomodState(() => 1000),
    logger: { error: vi.fn() },
  };
}

function message(over = {}) {
  return {
    guild: { id: "g1" },
    channelId: "c1",
    author: { id: "u1", bot: false },
    content: "",
    mentions: { users: new Map(), roles: new Map() },
    member: { permissions: { has: () => false }, roles: { cache: new Map() } },
    delete: vi.fn(async () => {}),
    client: { user: { id: "bot" } },
    ...over,
  };
}

const enabledConfig = {
  enabled: true,
  antiSpam: true,
  spamCount: 3,
  spamWindowSec: 5,
  antiMentionSpam: true,
  mentionLimit: 5,
  filterInvites: true,
  filterLinks: false,
  antiCaps: false,
  antiEmojiSpam: false,
  action: "delete",
  exemptRoles: [],
  exemptChannels: [],
};

describe("automod messageCreate", () => {
  it("ignores bots", async () => {
    const c = ctx(enabledConfig);
    const m = message({ author: { id: "b", bot: true } });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("does nothing when automod is disabled", async () => {
    const c = ctx({ ...enabledConfig, enabled: false });
    const m = message({ content: "discord.gg/x" });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("deletes an invite-link message", async () => {
    const c = ctx(enabledConfig);
    const m = message({ content: "join discord.gg/xyz" });
    await listener.execute(c, m);
    expect(m.delete).toHaveBeenCalled();
  });

  it("deletes on spam after the threshold", async () => {
    const c = ctx(enabledConfig);
    let m;
    for (let i = 0; i < 3; i++) {
      m = message();
      await listener.execute(c, m);
    }
    expect(m.delete).toHaveBeenCalled(); // 3rd message trips spamCount=3
  });

  it("skips exempt members", async () => {
    const c = ctx(enabledConfig);
    const m = message({
      content: "discord.gg/xyz",
      member: { permissions: { has: () => true }, roles: { cache: new Map() } },
    });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });
});
