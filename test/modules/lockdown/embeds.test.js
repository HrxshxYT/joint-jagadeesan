import { describe, it, expect, vi } from "vitest";
import { lockResultEmbed, unlockResultEmbed, statusEmbed } from "../../../src/modules/lockdown/embeds.js";

vi.mock("../../../src/modules/logging/dispatcher.js", () => ({
  logEvent: vi.fn(async () => true),
}));

import { logEvent } from "../../../src/modules/logging/dispatcher.js";
import { emitLockdownLog } from "../../../src/modules/lockdown/logging.js";

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

  it("unlock result shows actor, restored count, failure count, and the bot footer", () => {
    const e = unlockResultEmbed({
      actorId: "admin",
      counts: { restored: 7 },
      failed: [{ item: "bad", error: new Error("x") }],
    }).toJSON();
    const text = JSON.stringify(e);
    expect(text).toContain("admin");
    expect(text).toContain("7");
    expect(text).toContain("1"); // failed count surfaced
    expect(e.footer?.text).toBe("Suzune");
  });
});

describe("emitLockdownLog", () => {
  it("posts to modActions and skips the alert channel when none is configured", async () => {
    logEvent.mockClear();
    const embed = { title: "test" };
    const send = vi.fn(async () => {});
    const guild = { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ctx = { logger: { error: vi.fn() } };

    await emitLockdownLog(ctx, guild, embed, { alertChannelId: null });

    expect(logEvent).toHaveBeenCalledWith(ctx, guild, "modActions", embed);
    expect(send).not.toHaveBeenCalled();
  });

  it("also posts to the anti-nuke alert channel when configured", async () => {
    logEvent.mockClear();
    const embed = { title: "test" };
    const send = vi.fn(async () => {});
    const guild = {
      channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) },
    };
    const ctx = { logger: { error: vi.fn() } };

    await emitLockdownLog(ctx, guild, embed, { alertChannelId: "alert-1" });

    expect(logEvent).toHaveBeenCalledWith(ctx, guild, "modActions", embed);
    expect(guild.channels.fetch).toHaveBeenCalledWith("alert-1");
    expect(send).toHaveBeenCalledWith({ embeds: [embed] });
  });

  it("tolerates failures in both the modActions log and the alert-channel send", async () => {
    logEvent.mockRejectedValueOnce(new Error("dispatch failed"));
    const embed = { title: "test" };
    const guild = {
      channels: {
        fetch: vi.fn(async () => {
          throw new Error("fetch failed");
        }),
      },
    };
    const ctx = { logger: { error: vi.fn() } };

    await expect(emitLockdownLog(ctx, guild, embed, { alertChannelId: "alert-1" })).resolves.toBeUndefined();

    expect(ctx.logger.error).toHaveBeenCalledTimes(2);
  });
});
