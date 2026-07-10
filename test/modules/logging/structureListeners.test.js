import { describe, it, expect, vi } from "vitest";
import roleCreate from "../../../src/modules/logging/events/roleCreate.js";
import channelDelete from "../../../src/modules/logging/events/channelDelete.js";
import voiceUpdate from "../../../src/modules/logging/events/voiceStateUpdate.js";
import guildUpdate from "../../../src/modules/logging/events/guildUpdate.js";

function ctx() {
  const send = vi.fn(async () => {});
  const guild = {
    id: "g1",
    channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) },
  };
  return {
    config: {
      getGuild: vi.fn(async () => ({
        logging: {
          roleChanges: "c1",
          channelChanges: "c1",
          voice: "c1",
          serverChanges: "c1",
          disabled: [],
        },
      })),
    },
    logger: { error: vi.fn() },
    _send: send,
    _guild: guild,
  };
}

describe("structure listeners", () => {
  it("logs role creation", async () => {
    const c = ctx();
    await roleCreate.execute(c, { id: "r1", name: "New", guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
  it("logs channel deletion (guild channels only)", async () => {
    const c = ctx();
    await channelDelete.execute(c, { id: "ch1", name: "general", guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
  it("ignores DM channel deletion (no guild)", async () => {
    const c = ctx();
    await channelDelete.execute(c, { id: "dm", name: undefined });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a voice join", async () => {
    const c = ctx();
    await voiceUpdate.execute(
      c,
      { channelId: null, guild: c._guild },
      { channelId: "v1", member: { id: "u1" }, guild: c._guild },
    );
    expect(c._send).toHaveBeenCalled();
  });
  it("logs a server update", async () => {
    const c = ctx();
    await guildUpdate.execute(
      c,
      { id: "g1", name: "Old" },
      { id: "g1", name: "New", channels: c._guild.channels },
    );
    expect(c._send).toHaveBeenCalled();
  });
});
