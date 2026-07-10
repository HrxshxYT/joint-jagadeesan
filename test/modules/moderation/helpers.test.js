import { describe, it, expect, vi } from "vitest";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../../../src/modules/moderation/helpers.js";

const member = (id, pos, ownerId = "owner") => ({
  id,
  roles: { highest: { position: pos } },
  guild: { ownerId },
});

describe("checkHierarchy", () => {
  const bot = member("bot", 10);
  it("allows a valid action", () => {
    expect(
      checkHierarchy({ actorMember: member("a", 5), targetMember: member("t", 3), botMember: bot })
        .ok,
    ).toBe(true);
  });
  it("blocks with a message when the target is the owner", () => {
    const res = checkHierarchy({
      actorMember: member("a", 5),
      targetMember: member("owner", 3),
      botMember: bot,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/owner/i);
  });
  it("blocks when the actor is not higher", () => {
    const res = checkHierarchy({
      actorMember: member("a", 3),
      targetMember: member("t", 4),
      botMember: bot,
    });
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe("string");
  });
});

describe("dmTarget", () => {
  it("returns true on success", async () => {
    const user = { send: vi.fn(async () => {}) };
    expect(await dmTarget(user, {}, { debug: vi.fn() })).toBe(true);
  });
  it("returns false when DMs are closed", async () => {
    const user = {
      send: vi.fn(async () => {
        throw new Error("cannot dm");
      }),
    };
    expect(await dmTarget(user, {}, { debug: vi.fn() })).toBe(false);
  });
});

describe("buildCaseEmbed", () => {
  it("renders case fields", () => {
    const e = buildCaseEmbed({
      caseNumber: 5,
      type: "ban",
      targetId: "u1",
      moderatorId: "m1",
      reason: "spam",
      createdAt: new Date(),
    });
    const s = JSON.stringify(e.data);
    expect(s).toContain("5");
    expect(s).toContain("ban");
    expect(s).toContain("spam");
  });
});
