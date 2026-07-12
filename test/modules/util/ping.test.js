import { describe, it, expect, vi } from "vitest";
import { PingHistory } from "../../../src/lib/PingHistory.js";
import ping from "../../../src/modules/util/commands/ping.js";

describe("ping command", () => {
  it("has a name and no required permissions", () => {
    expect(ping.data.name).toBe("ping");
    expect(ping.permissions).toEqual([]);
  });

  it("samples the current ping and replies with a PNG attachment", async () => {
    const history = new PingHistory();
    const interaction = {
      client: { ws: { ping: 42 }, uptime: 3_600_000 },
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
    await ping.execute(interaction, { pingHistory: history });
    expect(history.samples()).toContain(42); // current ping recorded
    expect(interaction.deferReply).toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
    const buf = payload.files[0].attachment;
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
