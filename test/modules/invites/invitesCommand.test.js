import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/invites/commands/invites.js";

function ctx() {
  return {
    invites: {
      getStats: vi.fn(async () => ({ regular: 5, left: 2, bonus: 4, total: 7 })),
      leaderboard: vi.fn(async () => [
        { userId: "b", count: 7 },
        { userId: "a", count: 3 },
      ]),
      addBonus: vi.fn(async () => ({})),
      reset: vi.fn(async () => {}),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    user: { id: "self1" },
    memberPermissions: { has: () => true },
    options: {
      getSubcommand: () => sub,
      getUser: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/invites", () => {
  it("view defaults to the caller and shows stats", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(c.invites.getStats).toHaveBeenCalledWith("g1", "self1");
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("view can target another user", async () => {
    const c = ctx();
    await command.execute(interaction("view", { user: { id: "other" } }), c);
    expect(c.invites.getStats).toHaveBeenCalledWith("g1", "other");
  });

  it("leaderboard replies with an embed", async () => {
    const c = ctx();
    const i = interaction("leaderboard");
    await command.execute(i, c);
    expect(c.invites.leaderboard).toHaveBeenCalledWith("g1", expect.any(Number));
    expect(i.reply).toHaveBeenCalled();
  });

  it("add gives bonus invites", async () => {
    const c = ctx();
    await command.execute(interaction("add", { user: { id: "u9" }, amount: 5 }), c);
    expect(c.invites.addBonus).toHaveBeenCalledWith("g1", "u9", 5);
  });

  it("reset clears a user's invites", async () => {
    const c = ctx();
    await command.execute(interaction("reset", { user: { id: "u9" } }), c);
    expect(c.invites.reset).toHaveBeenCalledWith("g1", "u9");
  });
});
