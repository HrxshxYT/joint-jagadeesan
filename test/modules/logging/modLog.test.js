import { describe, it, expect, vi } from "vitest";
import { handleCaseCreated } from "../../../src/modules/logging/modLog.js";

describe("handleCaseCreated", () => {
  it("dispatches a mod-action log to the configured channel", async () => {
    const send = vi.fn(async () => {});
    const guild = {
      id: "g1",
      channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) },
    };
    const context = {
      client: { guilds: { cache: new Map([["g1", guild]]) } },
      config: { getGuild: vi.fn(async () => ({ logging: { modActions: "c1", disabled: [] } })) },
      logger: { error: vi.fn() },
    };
    const ok = await handleCaseCreated(context, {
      caseNumber: 1,
      type: "ban",
      targetId: "u1",
      moderatorId: "m1",
      reason: "x",
      guildId: "g1",
    });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalled();
  });

  it("no-ops when the guild is not on this shard", async () => {
    const context = {
      client: { guilds: { cache: new Map() } },
      config: { getGuild: vi.fn() },
      logger: { error: vi.fn() },
    };
    const ok = await handleCaseCreated(context, {
      guildId: "gX",
      caseNumber: 1,
      type: "ban",
      targetId: "u1",
      moderatorId: "m1",
    });
    expect(ok).toBe(false);
  });
});
