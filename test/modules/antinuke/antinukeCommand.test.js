import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/antinuke/commands/antinuke.js";
import { buildStatusEmbed, buildWhitelistEmbed } from "../../../src/modules/antinuke/statusEmbed.js";

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

  it("whitelist add classifies an in-guild GuildMember as a user, not a role", async () => {
    const c = ctx();
    // A GuildMember exposes `.permissions` and `.user` but no top-level
    // `username`/`bot`; it must still be stored as a "user" so isWhitelisted matches.
    const target = { id: "u7", permissions: {}, user: { id: "u7", username: "bob" } };
    const i = interaction("whitelist", { action: "add", target });
    await command.execute(i, c);
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "u7", "user", "admin1");
  });

  it("whitelist add classifies a Role as a role", async () => {
    const c = ctx();
    const target = { id: "r3", permissions: {}, hexColor: "#fff", managed: false };
    const i = interaction("whitelist", { action: "add", target });
    await command.execute(i, c);
    expect(c.config.addWhitelist).toHaveBeenCalledWith("g1", "r3", "role", "admin1");
  });

  it("whitelistview replies with the whitelist embed", async () => {
    const c = ctx();
    c.config.getGuild = vi.fn(async () => ({
      whitelist: [{ targetId: "u1", type: "user" }],
    }));
    const i = interaction("whitelistview");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
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

describe("buildWhitelistEmbed", () => {
  it("shows an empty-state hint when nothing is whitelisted", () => {
    const e = buildWhitelistEmbed([]);
    expect(JSON.stringify(e.data)).toContain("No trusted users or roles");
  });

  it("mentions whitelisted users and roles under separate fields", () => {
    const e = buildWhitelistEmbed([
      { targetId: "u1", type: "user" },
      { targetId: "r1", type: "role" },
    ]);
    const json = JSON.stringify(e.data);
    expect(json).toContain("<@u1>");
    expect(json).toContain("<@&r1>");
  });

  it("keeps each field within Discord's 1024-char limit", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      targetId: `1234567890${i}`,
      type: "user",
    }));
    const e = buildWhitelistEmbed(many);
    for (const f of e.data.fields ?? []) {
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
  });
});
