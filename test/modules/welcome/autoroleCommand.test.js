import { describe, it, expect, vi } from "vitest";
import autorole from "../../../src/modules/welcome/commands/autorole.js";

function ctx(guild = {}) {
  return {
    config: {
      updateWelcome: vi.fn(async () => ({})),
      addAutoRole: vi.fn(async () => ({})),
      removeAutoRole: vi.fn(async () => {}),
      getGuild: vi.fn(async () => guild),
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
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/autorole", () => {
  it("add stores a role", async () => {
    const c = ctx();
    await autorole.execute(interaction("add", { role: { id: "r1" } }), c);
    expect(c.config.addAutoRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("remove deletes a role", async () => {
    const c = ctx();
    await autorole.execute(interaction("remove", { role: { id: "r1" } }), c);
    expect(c.config.removeAutoRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("list replies with an embed", async () => {
    const c = ctx({ autoRoles: [{ roleId: "r1" }] });
    const i = interaction("list");
    await autorole.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
