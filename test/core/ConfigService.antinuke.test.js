import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({
        id: "g1",
        antinuke: null,
        logging: null,
        modRoles: [],
        whitelist: [],
      })),
      create: vi.fn(async ({ data }) => ({ ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    antinukeConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({
        guildId: where.guildId,
        ...create,
        ...update,
      })),
    },
    whitelist: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("ConfigService anti-nuke methods", () => {
  it("upserts anti-nuke config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1"); // populate cache
    const row = await svc.updateAntinuke("g1", { enabled: true, punishment: "ban" });
    expect(row.enabled).toBe(true);
    expect(prisma.antinukeConfig.upsert).toHaveBeenCalled();
    // cache was invalidated -> next getGuild hits the DB again
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });

  it("adds and removes whitelist entries", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    const wl = await svc.addWhitelist("g1", "u1", "user", "admin1");
    expect(wl).toMatchObject({ guildId: "g1", targetId: "u1", type: "user", addedById: "admin1" });
    await svc.removeWhitelist("g1", "u1");
    expect(prisma.whitelist.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", targetId: "u1" },
    });
  });
});
