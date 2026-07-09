import { describe, it, expect, vi } from "vitest";
import ping from "../../../src/modules/util/commands/ping.js";

describe("ping command", () => {
  it("has a name and no required permissions", () => {
    expect(ping.data.name).toBe("ping");
    expect(ping.permissions).toEqual([]);
  });

  it("replies with a latency embed", async () => {
    const interaction = {
      client: { ws: { ping: 42 } },
      reply: vi.fn(async () => {}),
    };
    await ping.execute(interaction, { logger: { info: vi.fn() } });
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });
});
