import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma(existing = null) {
  const store = existing ? { ...existing } : null;
  return {
    _row: store,
    guild: {
      findUnique: vi.fn(async () => store),
      create: vi.fn(async ({ data }) => ({ ...data, antinuke: null, logging: null, modRoles: [] })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  };
}

describe("ConfigService", () => {
  it("creates a default guild row on first access when none exists", async () => {
    const prisma = mockPrisma(null);
    const svc = new ConfigService(prisma);
    const row = await svc.getGuild("g1");
    expect(prisma.guild.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: "g1" }) }),
    );
    expect(row.id).toBe("g1");
  });

  it("caches after first read so DB is not hit twice", async () => {
    const prisma = mockPrisma({ id: "g1", antinuke: null, logging: null, modRoles: [] });
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(1);
  });

  it("writes through and refreshes cache on updateGuild", async () => {
    const prisma = mockPrisma({ id: "g1", dmOnAction: true, antinuke: null, logging: null, modRoles: [] });
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    const updated = await svc.updateGuild("g1", { dmOnAction: false });
    expect(updated.dmOnAction).toBe(false);
    const cached = await svc.getGuild("g1");
    expect(cached.dmOnAction).toBe(false);
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(1); // served from cache after update
  });
});
