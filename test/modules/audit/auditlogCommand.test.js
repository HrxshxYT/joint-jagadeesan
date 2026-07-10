import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/audit/commands/auditlog.js";

function ctx(audit = {}) {
  return {
    config: {
      updateAudit: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ audit })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    user: { id: "admin1" },
    options: {
      getSubcommand: () => sub,
      getChannel: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
    fetchReply: vi.fn(async () => ({})),
    editReply: vi.fn(async () => {}),
  };
}

describe("/auditlog", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("auditlog");
    expect(command.permissions.length).toBe(1);
  });

  it("channel enables the feed and stores the channel", async () => {
    const c = ctx();
    await command.execute(interaction("channel", { channel: { id: "c9" } }), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: true, channelId: "c9" });
  });

  it("disable turns it off", async () => {
    const c = ctx();
    await command.execute(interaction("disable"), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { enabled: false });
  });

  it("view replies with an embed", async () => {
    const c = ctx({ enabled: true, channelId: "c1", events: {} });
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("events toggles a category off (on by default) and persists", async () => {
    const c = ctx({ enabled: true, channelId: "c1", events: {} });
    const click = { customId: "toggle:members:admin1", update: vi.fn(async () => {}) };
    let n = 0;
    c.awaitFn = vi.fn(async () => (n++ === 0 ? click : null));
    await command.execute(interaction("events"), c);
    expect(c.config.updateAudit).toHaveBeenCalledWith("g1", { events: { members: false } });
  });
});
