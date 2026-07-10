import { describe, it, expect, vi } from "vitest";
import { CaseService } from "../../../src/modules/moderation/CaseService.js";

function mockPrisma({ lastCaseNumber = 0 } = {}) {
  const tx = {
    case: {
      findFirst: vi.fn(async () => (lastCaseNumber ? { caseNumber: lastCaseNumber } : null)),
      create: vi.fn(async ({ data }) => ({ id: "c1", ...data })),
    },
  };
  return {
    $transaction: vi.fn(async (fn) => fn(tx)),
    _tx: tx,
    case: {
      findUnique: vi.fn(async ({ where }) => ({ id: "c1", ...where.guildId_caseNumber })),
      findMany: vi.fn(async () => [{ caseNumber: 1 }, { caseNumber: 2 }]),
      update: vi.fn(async ({ where, data }) => ({ ...where.guildId_caseNumber, ...data })),
      delete: vi.fn(async ({ where }) => ({ ...where.guildId_caseNumber })),
    },
  };
}

describe("CaseService", () => {
  it("allocates the first case number as 1", async () => {
    const prisma = mockPrisma({ lastCaseNumber: 0 });
    const svc = new CaseService(prisma);
    const c = await svc.createCase({ guildId: "g1", type: "ban", targetId: "u1", moderatorId: "m1" });
    expect(c.caseNumber).toBe(1);
    expect(c.reason).toBe("No reason provided");
  });

  it("increments the case number atomically", async () => {
    const prisma = mockPrisma({ lastCaseNumber: 7 });
    const svc = new CaseService(prisma);
    const c = await svc.createCase({
      guildId: "g1",
      type: "kick",
      targetId: "u1",
      moderatorId: "m1",
      reason: "spam",
    });
    expect(c.caseNumber).toBe(8);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("lists cases for a target and updates a reason", async () => {
    const prisma = mockPrisma();
    const svc = new CaseService(prisma);
    expect(await svc.listCases("g1", "u1")).toHaveLength(2);
    const updated = await svc.updateReason("g1", 2, "edited");
    expect(updated.reason).toBe("edited");
  });

  it("finds due expired temp bans", async () => {
    const prisma = mockPrisma();
    prisma.case.findMany = vi.fn(async ({ where }) => {
      expect(where.type).toBe("tempban");
      expect(where.active).toBe(true);
      return [{ id: "c9", targetId: "u9", guildId: "g1" }];
    });
    const svc = new CaseService(prisma);
    const due = await svc.dueExpired(new Date());
    expect(due[0].id).toBe("c9");
  });
});
