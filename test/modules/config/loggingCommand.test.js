import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/config/commands/logging.js";

function ctx(loggingRow = { disabled: [] }) {
  return {
    config: {
      updateLogging: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ logging: loggingRow })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getChannel: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/logging", () => {
  it("set maps a category to a channel", async () => {
    const c = ctx();
    await command.execute(
      interaction("set", { category: "memberJoinLeave", channel: { id: "c1" } }),
      c,
    );
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { memberJoinLeave: "c1" });
  });

  it("disable adds a category to the disabled list", async () => {
    const c = ctx({ disabled: [] });
    await command.execute(interaction("disable", { category: "voice" }), c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["voice"] });
  });

  it("enable removes a category from the disabled list", async () => {
    const c = ctx({ disabled: ["voice", "modActions"] });
    await command.execute(interaction("enable", { category: "voice" }), c);
    expect(c.config.updateLogging).toHaveBeenCalledWith("g1", { disabled: ["modActions"] });
  });

  it("view replies with an embed", async () => {
    const c = ctx({ memberJoinLeave: "c1", disabled: [] });
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
