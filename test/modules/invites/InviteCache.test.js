import { describe, it, expect } from "vitest";
import { findUsedInvite, InviteCache } from "../../../src/modules/invites/InviteCache.js";

describe("findUsedInvite", () => {
  it("finds the code whose uses increased", () => {
    const cached = new Map([
      ["abc", 5],
      ["xyz", 1],
    ]);
    const fresh = [
      { code: "abc", uses: 6, inviterId: "u1" },
      { code: "xyz", uses: 1, inviterId: "u2" },
    ];
    expect(findUsedInvite(cached, fresh)).toEqual({ code: "abc", inviterId: "u1" });
  });
  it("treats a brand-new code as used", () => {
    const cached = new Map();
    const fresh = [{ code: "new", uses: 1, inviterId: "u3" }];
    expect(findUsedInvite(cached, fresh)).toEqual({ code: "new", inviterId: "u3" });
  });
  it("returns null when nothing changed", () => {
    const cached = new Map([["abc", 5]]);
    const fresh = [{ code: "abc", uses: 5, inviterId: "u1" }];
    expect(findUsedInvite(cached, fresh)).toBeNull();
  });
});

describe("InviteCache", () => {
  it("stores and reads guild invite maps", () => {
    const c = new InviteCache();
    c.setGuild("g1", [{ code: "abc", uses: 3 }]);
    expect(c.getGuild("g1").get("abc")).toBe(3);
  });
  it("updates and removes single codes", () => {
    const c = new InviteCache();
    c.setGuild("g1", [{ code: "abc", uses: 3 }]);
    c.update("g1", "abc", 4);
    expect(c.getGuild("g1").get("abc")).toBe(4);
    c.remove("g1", "abc");
    expect(c.getGuild("g1").has("abc")).toBe(false);
  });
  it("returns an empty map for unknown guilds", () => {
    expect(new InviteCache().getGuild("nope").size).toBe(0);
  });
});
