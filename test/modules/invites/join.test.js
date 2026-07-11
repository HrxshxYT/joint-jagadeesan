import { describe, it, expect, vi } from "vitest";
import { processInviteJoin } from "../../../src/modules/invites/join.js";
import { InviteCache } from "../../../src/modules/invites/InviteCache.js";

describe("processInviteJoin", () => {
  it("attributes the join to the inviter and records it", async () => {
    const cache = new InviteCache();
    cache.setGuild("g1", [{ code: "abc", uses: 5 }]);
    const service = { recordJoin: vi.fn(async () => ({})) };
    const fetchInvites = vi.fn(async () => [{ code: "abc", uses: 6, inviterId: "inv1" }]);
    const member = { id: "m1", guild: { id: "g1" } };

    const used = await processInviteJoin({
      member,
      inviteCache: cache,
      service,
      fetchInvites,
      logger: { error: vi.fn() },
    });
    expect(used).toEqual({ code: "abc", inviterId: "inv1" });
    expect(service.recordJoin).toHaveBeenCalledWith({
      guildId: "g1",
      memberId: "m1",
      inviterId: "inv1",
      code: "abc",
    });
    // cache re-synced to fresh uses
    expect(cache.getGuild("g1").get("abc")).toBe(6);
  });

  it("records an unknown attribution when no invite changed", async () => {
    const cache = new InviteCache();
    cache.setGuild("g1", [{ code: "abc", uses: 5 }]);
    const service = { recordJoin: vi.fn(async () => ({})) };
    const fetchInvites = vi.fn(async () => [{ code: "abc", uses: 5, inviterId: "inv1" }]);
    const member = { id: "m2", guild: { id: "g1" } };

    const used = await processInviteJoin({
      member,
      inviteCache: cache,
      service,
      fetchInvites,
      logger: { error: vi.fn() },
    });
    expect(used).toBeNull();
    expect(service.recordJoin).toHaveBeenCalledWith({
      guildId: "g1",
      memberId: "m2",
      inviterId: null,
      code: null,
    });
  });
});
