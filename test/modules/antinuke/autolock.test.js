import { describe, it, expect, vi } from "vitest";
import { processMemberAdd } from "../../../src/modules/antinuke/raid.js";

describe("anti-nuke auto-lock hook", () => {
  function baseState() {
    return { recordJoin: vi.fn(() => 99) };
  }

  it("fires panic lockdown on raid when autoLockOnTrigger is on", async () => {
    const lockdownPanic = vi.fn(async () => {});
    const deps = { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => {}), lockdownPanic };
    const guildConfig = {
      antinuke: {
        enabled: true,
        antiRaidEnabled: true,
        raidJoinCount: 10,
        raidWindowSec: 10,
        autoLockOnTrigger: true,
        alertChannelId: null,
      },
      whitelist: [],
    };
    const member = { id: "u1", guild: { id: "g1" }, kick: vi.fn() };
    await processMemberAdd({ member, guildConfig, state: baseState(), deps, logger: console });
    expect(lockdownPanic).toHaveBeenCalledWith(member.guild, expect.any(String));
  });

  it("does NOT fire lockdown when the flag is off", async () => {
    const lockdownPanic = vi.fn(async () => {});
    const deps = { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => {}), lockdownPanic };
    const guildConfig = {
      antinuke: {
        enabled: true,
        antiRaidEnabled: true,
        raidJoinCount: 10,
        raidWindowSec: 10,
        autoLockOnTrigger: false,
        alertChannelId: null,
      },
      whitelist: [],
    };
    const member = { id: "u1", guild: { id: "g1" }, kick: vi.fn() };
    await processMemberAdd({ member, guildConfig, state: baseState(), deps, logger: console });
    expect(lockdownPanic).not.toHaveBeenCalled();
  });
});
