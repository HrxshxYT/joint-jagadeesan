import { describe, it, expect, vi } from "vitest";
import { withConfirm } from "../../../src/modules/moderation/confirm.js";
import { successEmbed } from "../../../src/lib/embeds.js";

function interaction() {
  return {
    user: { id: "u1" },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("withConfirm", () => {
  it("runs onConfirm and shows the result when confirmed", async () => {
    const i = interaction();
    const onConfirm = vi.fn(async () => successEmbed("banned"));
    const click = { customId: "confirm:yes:u1", update: vi.fn(async () => {}) };
    await withConfirm({ interaction: i, summaryEmbed: successEmbed("sure?"), onConfirm, awaitFn: async () => click });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(click.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), components: expect.any(Array) }),
    );
  });

  it("does NOT run onConfirm when cancelled", async () => {
    const i = interaction();
    const onConfirm = vi.fn(async () => successEmbed("x"));
    const click = { customId: "confirm:no:u1", update: vi.fn(async () => {}) };
    await withConfirm({ interaction: i, summaryEmbed: successEmbed("sure?"), onConfirm, awaitFn: async () => click });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(click.update).toHaveBeenCalled();
  });

  it("does NOT run onConfirm on timeout (null) and edits the original", async () => {
    const i = interaction();
    const onConfirm = vi.fn(async () => successEmbed("x"));
    await withConfirm({ interaction: i, summaryEmbed: successEmbed("sure?"), onConfirm, awaitFn: async () => null });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });
});
