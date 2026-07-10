import { describe, it, expect, vi } from "vitest";
import { InviteService } from "../../../src/modules/invites/InviteService.js";

function mockPrisma() {
  return {
    memberInvite: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      findUnique: vi.fn(async ({ where }) => ({ ...where.guildId_memberId, inviterId: "inv1" })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async ({ where }) => (where.left ? 2 : 5)),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      groupBy: vi.fn(async () => [
        { inviterId: "a", _count: { inviterId: 3 } },
        { inviterId: "b", _count: { inviterId: 7 } },
      ]),
    },
    inviteBonus: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      findUnique: vi.fn(async () => ({ amount: 4 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("InviteService", () => {
  it("records a join attribution", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    await svc.recordJoin({ guildId: "g1", memberId: "m1", inviterId: "inv1", code: "abc" });
    expect(prisma.memberInvite.upsert).toHaveBeenCalled();
  });

  it("marks a member as left and returns the prior row", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const rec = await svc.markLeft("g1", "m1");
    expect(rec.inviterId).toBe("inv1");
    expect(prisma.memberInvite.update).toHaveBeenCalled();
  });

  it("computes stats with the invite formula", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const stats = await svc.getStats("g1", "u1");
    // regular=5, left=2, bonus=4 -> total = 5 + 4 - 2 = 7
    expect(stats).toEqual({ regular: 5, left: 2, bonus: 4, total: 7 });
  });

  it("builds a descending leaderboard", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const lb = await svc.leaderboard("g1", 10);
    expect(lb[0]).toEqual({ userId: "b", count: 7 });
    expect(lb[1]).toEqual({ userId: "a", count: 3 });
  });
});
