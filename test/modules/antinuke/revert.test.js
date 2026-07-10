import { describe, it, expect, vi } from "vitest";
import { revertAction } from "../../../src/modules/antinuke/revert.js";

const logger = { error: vi.fn() };
const makeGuild = () => ({
  channels: { create: vi.fn(async () => {}) },
  roles: { create: vi.fn(async () => {}) },
  bans: { remove: vi.fn(async () => {}) },
});

describe("revertAction", () => {
  it("recreates a deleted channel", async () => {
    const guild = makeGuild();
    const out = await revertAction({
      actionKey: "channelDelete",
      entry: { target: { name: "general", type: 0 } },
      guild,
      logger,
    });
    expect(out).toBe("channel_recreated");
    expect(guild.channels.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "general" }),
    );
  });

  it("recreates a deleted role", async () => {
    const guild = makeGuild();
    const out = await revertAction({
      actionKey: "roleDelete",
      entry: { target: { name: "Members" } },
      guild,
      logger,
    });
    expect(out).toBe("role_recreated");
    expect(guild.roles.create).toHaveBeenCalled();
  });

  it("lifts a ban", async () => {
    const guild = makeGuild();
    const out = await revertAction({
      actionKey: "ban",
      entry: { targetId: "victim1" },
      guild,
      logger,
    });
    expect(out).toBe("unbanned");
    expect(guild.bans.remove).toHaveBeenCalledWith("victim1", expect.any(String));
  });

  it("returns no_revert for unsupported actions", async () => {
    const out = await revertAction({
      actionKey: "channelUpdate",
      entry: {},
      guild: makeGuild(),
      logger,
    });
    expect(out).toBe("no_revert");
  });
});
