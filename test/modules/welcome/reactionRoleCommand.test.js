import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/welcome/commands/reactionrole.js";

function ctx() {
  return {
    reactionRoles: {
      add: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      listForGuild: vi.fn(async () => [{ messageId: "m1", emoji: "😀", roleId: "role1" }]),
    },
    logger: { error: vi.fn() },
  };
}

function interaction(sub, opts = {}) {
  const message = { id: "m1", react: vi.fn(async () => {}) };
  return {
    guildId: "g1",
    channelId: "c1",
    channel: { messages: { fetch: vi.fn(async () => message) } },
    _message: message,
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/reactionrole", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("reactionrole");
    expect(command.permissions.length).toBe(1);
  });

  it("add reacts to the message and stores the mapping", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "m1", emoji: "😀", role: { id: "role1" } });
    await command.execute(i, c);
    expect(i._message.react).toHaveBeenCalledWith("😀");
    expect(c.reactionRoles.add).toHaveBeenCalledWith({
      guildId: "g1",
      channelId: "c1",
      messageId: "m1",
      emoji: "😀",
      roleId: "role1",
    });
  });

  it("add uses the custom-emoji id as the stored key", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "m1", emoji: "<:smile:999>", role: { id: "role1" } });
    await command.execute(i, c);
    expect(i._message.react).toHaveBeenCalledWith("999");
    expect(c.reactionRoles.add).toHaveBeenCalledWith(expect.objectContaining({ emoji: "999" }));
  });

  it("remove deletes the mapping", async () => {
    const c = ctx();
    const i = interaction("remove", { message_id: "m1", emoji: "😀" });
    await command.execute(i, c);
    expect(c.reactionRoles.remove).toHaveBeenCalledWith("g1", "m1", "😀");
  });

  it("list replies with an embed", async () => {
    const c = ctx();
    const i = interaction("list");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("replies with an error when the message is not found", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "bad", emoji: "😀", role: { id: "role1" } });
    i.channel.messages.fetch = vi.fn(async () => {
      throw new Error("Unknown Message");
    });
    await command.execute(i, c);
    expect(c.reactionRoles.add).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), ephemeral: true }),
    );
  });
});
