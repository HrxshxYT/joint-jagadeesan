import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/util/events/interactionCreate.js";

function ctx() {
  return {
    commands: { get: vi.fn(() => undefined) },
    config: { getGuild: vi.fn() },
    cooldowns: { check: vi.fn(() => ({ limited: false })) },
    logger: { error: vi.fn() },
  };
}

describe("interaction router component guard", () => {
  it("ignores button interactions without touching command lookup", async () => {
    const c = ctx();
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
    };
    await listener.execute(c, interaction);
    expect(c.commands.get).not.toHaveBeenCalled();
  });

  it("ignores select-menu interactions too", async () => {
    const c = ctx();
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
    };
    await listener.execute(c, interaction);
    expect(c.commands.get).not.toHaveBeenCalled();
  });
});
