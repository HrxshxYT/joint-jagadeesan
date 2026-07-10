import { describe, it, expect, vi } from "vitest";
import { ReactionRoleService } from "../../../src/modules/welcome/ReactionRoleService.js";

function prismaMock() {
  return {
    reactionRole: {
      upsert: vi.fn(async ({ create }) => ({ id: "rr1", ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ id: "rr1", roleId: "role1" })),
      findMany: vi.fn(async () => [{ id: "rr1" }]),
    },
  };
}

describe("ReactionRoleService", () => {
  it("upserts a mapping keyed by guild+message+emoji", async () => {
    const prisma = prismaMock();
    const svc = new ReactionRoleService(prisma);
    await svc.add({ guildId: "g1", channelId: "c1", messageId: "m1", emoji: "😀", roleId: "role1" });
    expect(prisma.reactionRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId_messageId_emoji: { guildId: "g1", messageId: "m1", emoji: "😀" } },
      }),
    );
  });

  it("finds a mapping", async () => {
    const svc = new ReactionRoleService(prismaMock());
    const rr = await svc.find("g1", "m1", "😀");
    expect(rr.roleId).toBe("role1");
  });

  it("removes by guild+message+emoji", async () => {
    const prisma = prismaMock();
    await new ReactionRoleService(prisma).remove("g1", "m1", "😀");
    expect(prisma.reactionRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", messageId: "m1", emoji: "😀" },
    });
  });
});
