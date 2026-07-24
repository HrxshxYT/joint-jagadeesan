import { describe, it, expect, vi } from "vitest";
import { sweepExpiredLockdowns } from "../../../src/modules/lockdown/sweep.js";

describe("sweepExpiredLockdowns", () => {
  it("unlocks an expired lockdown exactly once", async () => {
    const past = new Date(Date.now() - 60_000);
    const due = [{ id: "L1", guildId: "g1", expiresAt: past, status: "active" }];
    const prisma = {
      lockdownState: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(due) // first sweep finds it
          .mockResolvedValueOnce([]), // second finds nothing (now lifted)
      },
    };
    const guild = { id: "g1" };
    const client = { guilds: { cache: new Map([["g1", guild]]) } };
    const unlock = vi.fn(async () => ({ ok: true }));
    const lockdown = { unlock };

    const first = await sweepExpiredLockdowns({ client, lockdown, prisma, logger: console });
    expect(first).toBe(1);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith(
      expect.objectContaining({ guild, actorId: expect.any(String) }),
    );

    const second = await sweepExpiredLockdowns({ client, lockdown, prisma, logger: console });
    expect(second).toBe(0);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("skips guilds the shard cannot see", async () => {
    const past = new Date(Date.now() - 60_000);
    const prisma = {
      lockdownState: {
        findMany: vi.fn(async () => [{ id: "L1", guildId: "ghost", expiresAt: past, status: "active" }]),
      },
    };
    const client = { guilds: { cache: new Map() } };
    const unlock = vi.fn(async () => ({ ok: true }));
    const count = await sweepExpiredLockdowns({ client, lockdown: { unlock }, prisma, logger: console });
    expect(count).toBe(0);
    expect(unlock).not.toHaveBeenCalled();
  });
});
