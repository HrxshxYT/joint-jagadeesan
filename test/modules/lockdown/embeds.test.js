import { describe, it, expect } from "vitest";
import { lockResultEmbed, statusEmbed } from "../../../src/modules/lockdown/embeds.js";

describe("lockdown embeds", () => {
  it("lock result shows tier, actor, and failure count", () => {
    const e = lockResultEmbed({
      tier: "channels",
      reason: "raid",
      actorId: "admin",
      durationMs: 3_600_000,
      counts: { snapshots: 10, failed: 2 },
      failed: [{ item: "bad", error: new Error("x") }, { item: "bad2", error: new Error("y") }],
    }).toJSON();
    const text = JSON.stringify(e);
    expect(text).toContain("channels");
    expect(text).toContain("admin");
    expect(text).toContain("2"); // failed count surfaced
  });

  it("status embed reports no active lockdown when state is null", () => {
    const e = statusEmbed(null).toJSON();
    expect(JSON.stringify(e).toLowerCase()).toContain("no active");
  });

  it("status embed reports the active tier", () => {
    const e = statusEmbed({
      tier: "full",
      reason: "raid",
      startedById: "admin",
      startedAt: new Date(),
      expiresAt: null,
      invitesPausedByUs: true,
      status: "active",
    }).toJSON();
    expect(JSON.stringify(e)).toContain("full");
  });
});
