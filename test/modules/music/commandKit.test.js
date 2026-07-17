import { describe, it, expect, vi } from "vitest";
import { getActivePlayer } from "../../../src/modules/music/commandKit.js";

function interaction(channelId = "vc1") {
  return { guildId: "g1", member: { voice: { channelId } }, reply: vi.fn(async () => {}) };
}
const player = { voiceChannelId: "vc1" };

describe("getActivePlayer", () => {
  it("replies and returns null when music is disabled", async () => {
    const i = interaction();
    const result = await getActivePlayer(i, { music: { isEnabled: false } });
    expect(result).toBe(null);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("replies and returns null when there is no player", async () => {
    const i = interaction();
    const result = await getActivePlayer(i, { music: { isEnabled: true, getPlayer: () => undefined } });
    expect(result).toBe(null);
    expect(i.reply).toHaveBeenCalled();
  });

  it("replies and returns null when the member is in another channel", async () => {
    const i = interaction("other");
    const result = await getActivePlayer(i, { music: { isEnabled: true, getPlayer: () => player } });
    expect(result).toBe(null);
  });

  it("returns the player when enabled, present, and same channel", async () => {
    const i = interaction("vc1");
    const result = await getActivePlayer(i, { music: { isEnabled: true, getPlayer: () => player } });
    expect(result).toBe(player);
    expect(i.reply).not.toHaveBeenCalled();
  });
});
