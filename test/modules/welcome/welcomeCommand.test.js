import { describe, it, expect, vi } from "vitest";
import welcome from "../../../src/modules/welcome/commands/welcome.js";
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

describe("/welcome", () => {
  it("is admin-gated", () => {
    expect(welcome.data.name).toBe("welcome");
    expect(welcome.permissions.length).toBe(1);
  });
  it("set-channel enables welcome and stores the channel", async () => {
    const c = ctx();
    await welcome.execute(interaction("set-channel", { channel: { id: "c1" } }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
    });
  });
  it("set-message stores the template", async () => {
    const c = ctx();
    await welcome.execute(interaction("set-message", { text: "hi {user}" }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeMessage: "hi {user}" });
  });
  it("goodbye-channel enables goodbye and stores the channel", async () => {
    const c = ctx();
    await welcome.execute(interaction("goodbye-channel", { channel: { id: "c2" } }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      goodbyeEnabled: true,
      goodbyeChannelId: "c2",
    });
  });
  it("disable turns both off", async () => {
    const c = ctx();
    await welcome.execute(interaction("disable"), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      welcomeEnabled: false,
      goodbyeEnabled: false,
    });
  });
});

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
