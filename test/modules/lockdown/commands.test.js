import { describe, it, expect, vi, beforeEach } from "vitest";
import { PermissionFlagsBits } from "discord.js";

vi.mock("../../../src/modules/lockdown/logging.js", () => ({
  emitLockdownLog: vi.fn(async () => {}),
}));

import lockserver from "../../../src/modules/lockdown/commands/lockserver.js";
import unlockserver from "../../../src/modules/lockdown/commands/unlockserver.js";
import { emitLockdownLog } from "../../../src/modules/lockdown/logging.js";

beforeEach(() => {
  emitLockdownLog.mockClear();
});

describe("lockserver command metadata", () => {
  it("registers subcommands and requires ManageGuild/Administrator", () => {
    const json = lockserver.data.toJSON();
    expect(json.name).toBe("lockserver");
    const subs = json.options.map((o) => o.name).sort();
    expect(subs).toEqual(["channels", "full", "invites", "joins", "panic", "status", "voice"]);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.Administrator);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });

  it("unlockserver is named and gated the same way", () => {
    expect(unlockserver.data.toJSON().name).toBe("unlockserver");
    expect(unlockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });
});

describe("lockserver status subcommand", () => {
  it("replies with status without starting a lockdown", async () => {
    const reply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: { getSubcommand: () => "status", getString: () => null },
      user: { id: "admin" },
      reply,
    };
    const ctx = {
      logger: console,
      lockdown: { status: vi.fn(async () => null), start: vi.fn() },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    expect(ctx.lockdown.status).toHaveBeenCalledWith("g1");
    expect(ctx.lockdown.start).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });

  it("a tier subcommand that is already active reports status, does not re-lock", async () => {
    const reply = vi.fn(async () => {});
    const deferReply = vi.fn(async () => {});
    const editReply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: {
        getSubcommand: () => "channels",
        getString: (n) => (n === "reason" ? "raid" : null),
        getChannel: () => null,
      },
      user: { id: "admin" },
      reply,
      deferReply,
      editReply,
    };
    const active = {
      tier: "channels",
      status: "active",
      startedById: "admin",
      startedAt: new Date(),
      reason: "r",
    };
    const ctx = {
      logger: console,
      lockdown: {
        status: vi.fn(async () => active),
        start: vi.fn(async () => ({ ok: false, alreadyActive: true, state: active })),
      },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    // Already deferred by the time we learn it's active, so the report goes
    // through editReply, not reply (calling reply() after deferReply() would
    // throw against the real Discord API).
    expect(deferReply).toHaveBeenCalled();
    expect(editReply).toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();

    // Discriminate from the success fall-through: the success path renders
    // the "🔒 Server locked down" lockResultEmbed and calls emitLockdownLog;
    // the already-active path renders a warning naming the active lockdown
    // and never touches the logging pipeline.
    const firstCallEmbeds = editReply.mock.calls[0][0].embeds;
    const firstEmbedJson = firstCallEmbeds[0].toJSON();
    expect(firstEmbedJson.description).toMatch(/already active/i);
    expect(emitLockdownLog).not.toHaveBeenCalled();
  });
});

describe("unlockserver command", () => {
  function makeInteraction() {
    return {
      guildId: "g1",
      guild: { id: "g1" },
      user: { id: "admin" },
      deferReply: vi.fn(async () => {}),
      editReply: vi.fn(async () => {}),
    };
  }

  it("reports there is no active lockdown and does not log", async () => {
    const interaction = makeInteraction();
    const ctx = {
      logger: console,
      lockdown: { unlock: vi.fn(async () => ({ ok: false, reason: "none" })) },
      config: { getGuild: vi.fn(async () => ({ antinuke: null })) },
    };
    await unlockserver.execute(interaction, ctx);
    expect(interaction.deferReply).toHaveBeenCalled();
    const embed = interaction.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).toMatch(/no active lockdown/i);
    expect(emitLockdownLog).not.toHaveBeenCalled();
  });

  it("refuses to guess on a corrupt snapshot and leaves the record intact", async () => {
    const interaction = makeInteraction();
    const ctx = {
      logger: console,
      lockdown: {
        unlock: vi.fn(async () => ({ ok: false, reason: "corrupt", state: { id: "s1" } })),
      },
      config: { getGuild: vi.fn(async () => ({ antinuke: null })) },
    };
    await unlockserver.execute(interaction, ctx);
    const embed = interaction.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).toMatch(/corrupt/i);
    expect(embed.description).toMatch(/restore.*manually/i);
    expect(emitLockdownLog).not.toHaveBeenCalled();
  });

  it("surfaces partial failures and asks the admin to re-run the command", async () => {
    const interaction = makeInteraction();
    const ctx = {
      logger: console,
      lockdown: {
        unlock: vi.fn(async () => ({
          ok: false,
          reason: "partial",
          failed: [{ item: "c1", error: new Error("x") }],
        })),
      },
      config: { getGuild: vi.fn(async () => ({ antinuke: null })) },
    };
    await unlockserver.execute(interaction, ctx);
    const embeds = interaction.editReply.mock.calls[0][0].embeds.map((e) => e.toJSON());
    const combined = embeds.map((e) => e.description ?? "").join(" ");
    expect(combined).toMatch(/could not be restored/i);
    expect(combined).toMatch(/unlockserver/i);
    expect(emitLockdownLog).not.toHaveBeenCalled();
  });

  it("reports success and emits a lockdown log", async () => {
    const interaction = makeInteraction();
    const ctx = {
      logger: console,
      lockdown: {
        unlock: vi.fn(async () => ({ ok: true, counts: { restored: 3 }, failed: [] })),
      },
      config: { getGuild: vi.fn(async () => ({ antinuke: null })) },
    };
    await unlockserver.execute(interaction, ctx);
    const embed = interaction.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.title).toMatch(/lifted/i);
    expect(emitLockdownLog).toHaveBeenCalledTimes(1);
    expect(emitLockdownLog).toHaveBeenCalledWith(ctx, interaction.guild, expect.anything(), {
      alertChannelId: null,
    });
  });
});
