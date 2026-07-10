import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/config/commands/config.js";
import { buildConfigEmbed } from "../../../src/modules/config/statusEmbed.js";

function ctx() {
  return {
    config: {
      addModRole: vi.fn(async () => ({})),
      removeModRole: vi.fn(async () => {}),
      updateGuild: vi.fn(async () => ({})),
      resetGuildConfig: vi.fn(async () => {}),
      getGuild: vi.fn(async () => ({ dmOnAction: true, muteRoleId: null, modRoles: [] })),
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
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/config", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("config");
    expect(command.permissions.length).toBe(1);
  });
  it("modrole add stores a role", async () => {
    const c = ctx();
    await command.execute(interaction("modrole", { action: "add", role: { id: "r1" } }), c);
    expect(c.config.addModRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("dmonaction off updates the flag", async () => {
    const c = ctx();
    await command.execute(interaction("dmonaction", { state: "off" }), c);
    expect(c.config.updateGuild).toHaveBeenCalledWith("g1", { dmOnAction: false });
  });
  it("muterole with no role clears it", async () => {
    const c = ctx();
    await command.execute(interaction("muterole", {}), c);
    expect(c.config.updateGuild).toHaveBeenCalledWith("g1", { muteRoleId: null });
  });
  it("reset calls resetGuildConfig", async () => {
    const c = ctx();
    await command.execute(interaction("reset"), c);
    expect(c.config.resetGuildConfig).toHaveBeenCalledWith("g1");
  });
  it("view replies with an embed", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("buildConfigEmbed", () => {
  it("summarizes settings", () => {
    const e = buildConfigEmbed({ dmOnAction: true, muteRoleId: "r9", modRoles: [{ roleId: "r1" }] });
    expect(JSON.stringify(e.data)).toContain("r9");
  });
});
