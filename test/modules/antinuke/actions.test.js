import { describe, it, expect } from "vitest";
import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import { mapAuditLogEntry, DEFAULT_THRESHOLDS } from "../../../src/modules/antinuke/actions.js";

describe("mapAuditLogEntry", () => {
  it("maps direct destructive actions to keys", () => {
    expect(mapAuditLogEntry({ action: AuditLogEvent.ChannelDelete })).toEqual({
      actionKey: "channelDelete",
    });
    expect(mapAuditLogEntry({ action: AuditLogEvent.MemberBanAdd })).toEqual({ actionKey: "ban" });
    expect(mapAuditLogEntry({ action: AuditLogEvent.WebhookCreate })).toEqual({
      actionKey: "webhookCreate",
    });
    expect(mapAuditLogEntry({ action: AuditLogEvent.BotAdd })).toEqual({ actionKey: "botAdd" });
  });

  it("returns null for unwatched actions", () => {
    expect(mapAuditLogEntry({ action: AuditLogEvent.MessagePin })).toBeNull();
  });

  it("flags a role update that grants Administrator as dangerous", () => {
    const admin = PermissionFlagsBits.Administrator.toString();
    const entry = {
      action: AuditLogEvent.RoleUpdate,
      changes: [{ key: "permissions", old: "0", new: admin }],
    };
    expect(mapAuditLogEntry(entry)).toEqual({ actionKey: "roleUpdateDangerous" });
  });

  it("ignores a benign role update", () => {
    const entry = {
      action: AuditLogEvent.RoleUpdate,
      changes: [{ key: "name", old: "a", new: "b" }],
    };
    expect(mapAuditLogEntry(entry)).toBeNull();
  });

  it("provides sane default thresholds for every mapped key", () => {
    expect(DEFAULT_THRESHOLDS.channelDelete.limit).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.roleUpdateDangerous.limit).toBe(1);
  });
});
