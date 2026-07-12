import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import welcome from "../../../src/modules/welcome/commands/welcome.js";

describe("welcome command", () => {
  it("is an Administrator-gated bare command (panel entry, no subcommands)", () => {
    expect(welcome.data.name).toBe("welcome");
    expect(welcome.permissions).toEqual([PermissionFlagsBits.Administrator]);
    const json = welcome.data.toJSON();
    expect(json.options ?? []).toHaveLength(0); // no subcommands
  });
});
