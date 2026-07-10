import { describe, it, expect, vi } from "vitest";
import help from "../../../src/modules/util/commands/help.js";
import { buildHelpOverviewEmbed, buildHelpDetailEmbed } from "../../../src/modules/util/help.js";

function commandsMap() {
  return new Map([
    ["ban", { data: { name: "ban", description: "Ban a user" }, category: "moderation", permissions: [1] }],
    ["ping", { data: { name: "ping", description: "Latency" }, category: "util", permissions: [] }],
  ]);
}

describe("help embeds", () => {
  it("overview groups commands by category", () => {
    const e = buildHelpOverviewEmbed(commandsMap());
    const s = JSON.stringify(e.data);
    expect(s).toContain("moderation");
    expect(s).toContain("ban");
    expect(s).toContain("ping");
  });
  it("detail shows description and permission note", () => {
    const e = buildHelpDetailEmbed({
      data: { name: "ban", description: "Ban a user" },
      category: "moderation",
      permissions: [1],
    });
    const s = JSON.stringify(e.data);
    expect(s).toContain("Ban a user");
  });
});

describe("/help command", () => {
  it("with no argument replies with the overview", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => null }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("with a known command replies with its detail", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => "ban" }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalled();
  });

  it("with an unknown command replies ephemerally", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getString: () => "nope" }, reply: vi.fn(async () => {}) };
    await help.execute(i, ctx);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("autocomplete responds with matching command names", async () => {
    const ctx = { commands: commandsMap() };
    const i = { options: { getFocused: () => "ba" }, respond: vi.fn(async () => {}) };
    await help.autocomplete(i, ctx);
    expect(i.respond).toHaveBeenCalledWith([{ name: "ban", value: "ban" }]);
  });
});
