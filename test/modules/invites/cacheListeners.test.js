import { describe, it, expect, vi } from "vitest";
import ready from "../../../src/modules/invites/events/ready.js";
import inviteCreate from "../../../src/modules/invites/events/inviteCreate.js";
import inviteDelete from "../../../src/modules/invites/events/inviteDelete.js";
import { InviteCache } from "../../../src/modules/invites/InviteCache.js";

function ctx() {
  return { inviteCache: new InviteCache(), logger: { error: vi.fn(), info: vi.fn() } };
}

function guild(id, invites) {
  return {
    id,
    invites: { fetch: vi.fn(async () => new Map(invites.map((i) => [i.code, i]))) },
  };
}

describe("ready listener", () => {
  it("seeds the cache for each guild", async () => {
    const c = ctx();
    const g = guild("g1", [{ code: "abc", uses: 2, inviter: { id: "u1" } }]);
    const client = { guilds: { cache: new Map([["g1", g]]) } };
    await ready.execute(c, client);
    expect(c.inviteCache.getGuild("g1").get("abc")).toBe(2);
  });
});

describe("inviteCreate / inviteDelete", () => {
  it("adds a created invite to the cache", async () => {
    const c = ctx();
    await inviteCreate.execute(c, { guild: { id: "g1" }, code: "new", uses: 0 });
    expect(c.inviteCache.getGuild("g1").has("new")).toBe(true);
  });
  it("removes a deleted invite from the cache", async () => {
    const c = ctx();
    c.inviteCache.setGuild("g1", [{ code: "old", uses: 3 }]);
    await inviteDelete.execute(c, { guild: { id: "g1" }, code: "old" });
    expect(c.inviteCache.getGuild("g1").has("old")).toBe(false);
  });
});
