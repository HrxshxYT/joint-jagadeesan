import { describe, it, expect } from "vitest";
import { isAboveOrEqual, canActOn } from "../../src/lib/hierarchy.js";

const member = (id, pos, ownerId = "owner") => ({
  id,
  roles: { highest: { position: pos } },
  guild: { ownerId },
});

describe("isAboveOrEqual", () => {
  it("compares highest role positions", () => {
    expect(isAboveOrEqual(member("a", 5), member("b", 3))).toBe(true);
    expect(isAboveOrEqual(member("a", 3), member("b", 3))).toBe(true);
    expect(isAboveOrEqual(member("a", 2), member("b", 3))).toBe(false);
  });
});

describe("canActOn", () => {
  const bot = member("bot", 9);
  it("allows when actor and bot both outrank a non-owner target", () => {
    const res = canActOn({ actor: member("a", 5), target: member("t", 3), botMember: bot });
    expect(res.ok).toBe(true);
  });
  it("blocks acting on the guild owner", () => {
    const target = member("owner", 3);
    const res = canActOn({ actor: member("a", 5), target, botMember: bot });
    expect(res).toEqual({ ok: false, reason: "target_is_owner" });
  });
  it("blocks when actor does not outrank target", () => {
    const res = canActOn({ actor: member("a", 3), target: member("t", 4), botMember: bot });
    expect(res).toEqual({ ok: false, reason: "actor_not_higher" });
  });
  it("blocks when the bot does not outrank target", () => {
    // actor (10) outranks target (9) so the actor check passes; bot (9) does not.
    const res = canActOn({ actor: member("a", 10), target: member("t", 9), botMember: bot });
    expect(res).toEqual({ ok: false, reason: "bot_not_higher" });
  });
});
