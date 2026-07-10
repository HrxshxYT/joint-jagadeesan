import { describe, it, expect, vi } from "vitest";
import { buildIncidentEmbed, sendAlert } from "../../../src/modules/antinuke/alert.js";
import { COLORS } from "../../../src/lib/constants.js";

describe("buildIncidentEmbed", () => {
  it("builds an error-colored incident embed with executor and action", () => {
    const e = buildIncidentEmbed({
      actionKey: "channelDelete",
      executorId: "u1",
      count: 4,
      punishment: "ban",
    });
    expect(e.data.color).toBe(COLORS.error);
    expect(JSON.stringify(e.data)).toContain("channelDelete");
    expect(JSON.stringify(e.data)).toContain("u1");
  });
});

describe("sendAlert", () => {
  it("returns false when no channel is configured", async () => {
    const out = await sendAlert(
      { guild: {}, channelId: null, actionKey: "ban", executorId: "u1", count: 5, punishment: "ban" },
      { error: vi.fn() },
    );
    expect(out).toBe(false);
  });

  it("sends to a text channel and returns true", async () => {
    const send = vi.fn(async () => {});
    const guild = { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const out = await sendAlert(
      { guild, channelId: "c1", actionKey: "ban", executorId: "u1", count: 5, punishment: "ban" },
      { error: vi.fn() },
    );
    expect(out).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
