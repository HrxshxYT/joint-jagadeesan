import { describe, it, expect, vi } from "vitest";
import { CaseService } from "../../../src/modules/moderation/CaseService.js";

function mockPrisma() {
  const tx = {
    case: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: "c1", ...data })),
    },
  };
  return { $transaction: vi.fn(async (fn) => fn(tx)) };
}

describe("CaseService events", () => {
  it("emits caseCreated after creating a case", async () => {
    const svc = new CaseService(mockPrisma());
    const spy = vi.fn();
    svc.on("caseCreated", spy);
    await svc.createCase({ guildId: "g1", type: "ban", targetId: "u1", moderatorId: "m1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "ban", caseNumber: 1 }));
  });
});
