import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", welcome: null, autoRoles: [] })),
      create: vi.fn(async ({ data }) => ({ ...data, welcome: null, autoRoles: [] })),
    },
    welcomeConfig: { upsert: vi.fn(async ({ create, update }) => ({ ...create, ...update })) },
    autoRole: {
      upsert: vi.fn(async ({ create }) => create),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("ConfigService welcome/autorole", () => {
  it("upserts welcome config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.updateWelcome("g1", { welcomeEnabled: true, welcomeChannelId: "c1" });
    expect(prisma.welcomeConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" } }),
    );
    // cache was invalidated → next read hits findUnique again
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });

  it("adds and removes an autorole", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.addAutoRole("g1", "r1");
    expect(prisma.autoRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId_roleId: { guildId: "g1", roleId: "r1" } } }),
    );
    await svc.removeAutoRole("g1", "r1");
    expect(prisma.autoRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", roleId: "r1" },
    });
  });
});
