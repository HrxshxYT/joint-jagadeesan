import { describe, it, expect, vi } from "vitest";
import purge from "../../../src/modules/moderation/commands/purge.js";
import slowmode from "../../../src/modules/moderation/commands/slowmode.js";

describe("/purge", () => {
  it("bulk-deletes the requested amount after confirmation", async () => {
    const bulkDelete = vi.fn(async () => ({ size: 10 }));
    const click = { customId: "confirm:yes:mod1", update: vi.fn(async () => {}) };
    const i = {
      user: { id: "mod1" },
      channel: { bulkDelete },
      options: { getInteger: () => 10, getUser: () => null },
      reply: vi.fn(async () => {}),
      fetchReply: vi.fn(async () => ({})),
      editReply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() }, awaitFn: async () => click });
    expect(bulkDelete).toHaveBeenCalledWith(10, true);
    // the result embed is shown by updating the confirmation message
    expect(click.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it("rejects amounts outside 1-100 before confirming", async () => {
    const i = {
      user: { id: "mod1" },
      channel: { bulkDelete: vi.fn() },
      options: { getInteger: () => 500, getUser: () => null },
      reply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() } });
    expect(i.channel.bulkDelete).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("/slowmode", () => {
  it("sets the channel rate limit from a duration", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = {
      channel: { setRateLimitPerUser },
      options: { getString: () => "10s" },
      reply: vi.fn(async () => {}),
    };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(10);
  });

  it("clears slowmode on 'off'", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = {
      channel: { setRateLimitPerUser },
      options: { getString: () => "off" },
      reply: vi.fn(async () => {}),
    };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(0);
  });
});
