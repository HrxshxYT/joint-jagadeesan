import { describe, it, expect, vi } from "vitest";
import { handleReaction } from "../../../src/modules/welcome/reactions.js";

const logger = { error: vi.fn() };

function baseArgs(over = {}) {
  const member = { id: "u1" };
  return {
    reaction: {
      partial: false,
      emoji: { id: null, name: "😀" },
      message: { id: "m1", guildId: "g1", guild: { id: "g1" } },
    },
    user: { id: "u1", bot: false },
    action: "add",
    service: { find: vi.fn(async () => ({ roleId: "role1" })) },
    resolveMember: vi.fn(async () => member),
    assignRole: vi.fn(async () => {}),
    removeRole: vi.fn(async () => {}),
    logger,
    ...over,
  };
}

describe("handleReaction", () => {
  it("assigns the mapped role on add", async () => {
    const a = baseArgs();
    await handleReaction(a);
    expect(a.service.find).toHaveBeenCalledWith("g1", "m1", "😀");
    expect(a.assignRole).toHaveBeenCalledWith({ id: "u1" }, "role1");
  });

  it("removes the mapped role on remove", async () => {
    const a = baseArgs({ action: "remove" });
    await handleReaction(a);
    expect(a.removeRole).toHaveBeenCalledWith({ id: "u1" }, "role1");
  });

  it("uses the custom emoji id as the key", async () => {
    const a = baseArgs({
      reaction: {
        partial: false,
        emoji: { id: "999", name: "smile" },
        message: { id: "m1", guildId: "g1", guild: { id: "g1" } },
      },
    });
    await handleReaction(a);
    expect(a.service.find).toHaveBeenCalledWith("g1", "m1", "999");
  });

  it("ignores bot reactions", async () => {
    const a = baseArgs({ user: { id: "b", bot: true } });
    await handleReaction(a);
    expect(a.service.find).not.toHaveBeenCalled();
  });

  it("does nothing when no mapping exists", async () => {
    const a = baseArgs({ service: { find: vi.fn(async () => null) } });
    await handleReaction(a);
    expect(a.assignRole).not.toHaveBeenCalled();
  });
});
