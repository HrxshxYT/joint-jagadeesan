import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/antinuke/commands/antinuke.js";
import { buildStatusEmbed } from "../../../src/modules/antinuke/statusEmbed.js";

function ctx() {
  return {
    config: {
      updateAntinuke: vi.fn(async () => ({})),
      addWhitelist: vi.fn(async () => ({})),
      removeWhitelist: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({
        antinuke: { enabled: true, punishment: "ban", panicMode: false, autoRevert: true },
        whitelist: [],
      })),
    },
    logger: { info: vi.fn(), error: vi.fn() },
  };
}

function interaction(sub, options = {}) {
  return {
    guildId: "g1",
    user: { id: "admin1" },
    options: {
      getSubcommand: () => sub,
      getString: (k) => options[k] ?? null,
      getChannel: (k) => options[k] ?? null,
      getMentionable: (k) => options[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/antinuke command", () => {
  it("is admin-gated and named", () => {
    expect(command.data.name).toBe("antinuke");
    expect(command.permissions.length).toBe(1);
  });

  it("enable sets enabled=true", async () => {
    const c = ctx();
    await command.execute(interaction("enable"), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { enabled: true });
  });

  it("punishment sets the punishment type", async () => {
    const c = ctx();
    await command.execute(interaction("punishment", { type: "quarantine" }), c);
    expect(c.config.updateAntinuke).toHaveBeenCalledWith("g1", { punishment: "quarantine" });
  });

  it("whitelist add stores a user entry", async () => {
    const c = ctx();
    const target = { id: "u5", username: "alice" };
    const i = interaction("whitelist", { action: "add", target });
    await command.execute(i, c);
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "u5", "user", "admin1");
  });

  it("status replies with an embed", async () => {
    const c = ctx();
    const i = interaction("status");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("buildStatusEmbed", () => {
  it("summarizes config", () => {
    const e = buildStatusEmbed({
      antinuke: { enabled: true, punishment: "ban", panicMode: false, autoRevert: true },
      whitelist: [],
    });
    expect(JSON.stringify(e.data)).toContain("ban");
  });
});
