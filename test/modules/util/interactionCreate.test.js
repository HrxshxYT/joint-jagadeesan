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

function interaction(name) {
  return {
    isChatInputCommand: () => true,
    commandName: name,
    guildId: "g1",
    user: { id: "u1" },
    member: { permissions: { has: () => true }, roles: { cache: new Map() } },
    reply: vi.fn(async () => {}),
    replied: false,
    deferred: false,
  };
}

describe("interactionCreate", () => {
  it("executes a known command", async () => {
    const execute = vi.fn(async () => {});
    const command = { data: { name: "ping" }, permissions: [], execute };
    await listener.execute(ctx(command), interaction("ping"));
    expect(execute).toHaveBeenCalled();
  });

  it("ignores unknown commands without throwing", async () => {
    await expect(listener.execute(ctx(null), interaction("nope"))).resolves.toBeUndefined();
  });
});
