import { describe, it, expect, vi } from "vitest";
import warn from "../../../src/modules/moderation/commands/warn.js";
import warnings from "../../../src/modules/moderation/commands/warnings.js";
import caseCmd from "../../../src/modules/moderation/commands/case.js";

function ctx(overrides = {}) {
  return {
    cases: {
      createCase: vi.fn(async (d) => ({ caseNumber: 3, createdAt: new Date(), ...d })),
      listCases: vi.fn(async () => [
        {
          caseNumber: 1,
          type: "warn",
          reason: "a",
          moderatorId: "m",
          targetId: "u1",
          createdAt: new Date(),
        },
      ]),
      getCase: vi.fn(async () => ({
        caseNumber: 1,
        type: "warn",
        reason: "a",
        moderatorId: "m",
        targetId: "u1",
        createdAt: new Date(),
      })),
      updateReason: vi.fn(async () => ({
        caseNumber: 1,
        type: "warn",
        reason: "new",
        moderatorId: "m",
        targetId: "u1",
      })),
      deleteCase: vi.fn(async () => ({ caseNumber: 1 })),
      ...overrides,
    },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: true })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

const reply = () => vi.fn(async () => {});

describe("/warn", () => {
  it("records a warn case and replies", async () => {
    const c = ctx();
    const i = {
      guildId: "g1",
      guild: { name: "T" },
      user: { id: "mod1" },
      options: { getUser: () => ({ id: "u1", send: vi.fn(async () => {}) }), getString: () => "be nice" },
      reply: reply(),
    };
    await warn.execute(i, c);
    expect(c.cases.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warn", targetId: "u1" }),
    );
    expect(i.reply).toHaveBeenCalled();
  });
});

describe("/warnings", () => {
  it("lists a user's cases", async () => {
    const c = ctx();
    const i = { guildId: "g1", options: { getUser: () => ({ id: "u1" }) }, reply: reply() };
    await warnings.execute(i, c);
    expect(c.cases.listCases).toHaveBeenCalledWith("g1", "u1");
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("/case", () => {
  it("view returns the case embed", async () => {
    const c = ctx();
    const i = {
      guildId: "g1",
      options: { getSubcommand: () => "view", getInteger: () => 1, getString: () => null },
      reply: reply(),
    };
    await caseCmd.execute(i, c);
    expect(c.cases.getCase).toHaveBeenCalledWith("g1", 1);
  });

  it("reason edits a case", async () => {
    const c = ctx();
    const i = {
      guildId: "g1",
      options: { getSubcommand: () => "reason", getInteger: () => 1, getString: () => "new" },
      reply: reply(),
    };
    await caseCmd.execute(i, c);
    expect(c.cases.updateReason).toHaveBeenCalledWith("g1", 1, "new");
  });

  it("delete removes a case", async () => {
    const c = ctx();
    const i = {
      guildId: "g1",
      options: { getSubcommand: () => "delete", getInteger: () => 1, getString: () => null },
      reply: reply(),
    };
    await caseCmd.execute(i, c);
    expect(c.cases.deleteCase).toHaveBeenCalledWith("g1", 1);
  });
});
