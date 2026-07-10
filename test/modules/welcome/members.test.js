import { describe, it, expect, vi } from "vitest";
import { processMemberJoin, processMemberLeave } from "../../../src/modules/welcome/members.js";

const guild = { id: "g1", name: "Srv", memberCount: 5 };
const member = { id: "u1", user: { tag: "A#1", username: "A" }, guild };
const logger = { error: vi.fn() };

function deps() {
  return { assignRoles: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}) };
}

describe("processMemberJoin", () => {
  it("assigns autoroles and posts the welcome message", async () => {
    const d = deps();
    await processMemberJoin({
      member,
      guildConfig: {
        autoRoles: [{ roleId: "r1" }, { roleId: "r2" }],
        welcome: { welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "hi {username}" },
      },
      deps: d,
      logger,
    });
    expect(d.assignRoles).toHaveBeenCalledWith(member, ["r1", "r2"]);
    expect(d.sendMessage).toHaveBeenCalledWith(guild, "c1", "hi A");
  });

  it("skips the welcome message when disabled, still autoroles", async () => {
    const d = deps();
    await processMemberJoin({
      member,
      guildConfig: { autoRoles: [{ roleId: "r1" }], welcome: { welcomeEnabled: false } },
      deps: d,
      logger,
    });
    expect(d.assignRoles).toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("does nothing when there is no config", async () => {
    const d = deps();
    await processMemberJoin({ member, guildConfig: {}, deps: d, logger });
    expect(d.assignRoles).not.toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("swallows errors and logs them", async () => {
    const d = deps();
    d.assignRoles.mockRejectedValueOnce(new Error("boom"));
    await processMemberJoin({
      member,
      guildConfig: { autoRoles: [{ roleId: "r1" }], welcome: {} },
      deps: d,
      logger,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("processMemberLeave", () => {
  it("posts the goodbye message when enabled", async () => {
    const d = deps();
    await processMemberLeave({
      member,
      guildConfig: {
        welcome: { goodbyeEnabled: true, goodbyeChannelId: "c2", goodbyeMessage: "bye {user}" },
      },
      deps: d,
      logger,
    });
    expect(d.sendMessage).toHaveBeenCalledWith(guild, "c2", "bye A#1");
  });

  it("does nothing when goodbye is disabled", async () => {
    const d = deps();
    await processMemberLeave({
      member,
      guildConfig: { welcome: { goodbyeEnabled: false } },
      deps: d,
      logger,
    });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });
});
