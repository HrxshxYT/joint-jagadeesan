import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/util/events/interactionCreate.js";

function ctx(command) {
  return {
    commands: new Map(command ? [[command.data.name, command]] : []),
    config: { getGuild: vi.fn(async () => ({ modRoles: [] })) },
    cooldowns: { check: vi.fn(() => ({ limited: false })) },
    logger: { error: vi.fn(), info: vi.fn() },
  };
}

function autocompleteInteraction(name) {
  return {
    isChatInputCommand: () => false,
    isAutocomplete: () => true,
    commandName: name,
    respond: vi.fn(async () => {}),
  };
}

describe("autocomplete routing", () => {
  it("calls the command's autocomplete handler", async () => {
    const autocomplete = vi.fn(async () => {});
    const command = { data: { name: "help" }, permissions: [], execute: vi.fn(), autocomplete };
    await listener.execute(ctx(command), autocompleteInteraction("help"));
    expect(autocomplete).toHaveBeenCalled();
  });

  it("ignores autocomplete for commands without a handler", async () => {
    const command = { data: { name: "ping" }, permissions: [], execute: vi.fn() };
    const i = autocompleteInteraction("ping");
    await expect(listener.execute(ctx(command), i)).resolves.toBeUndefined();
  });
});
