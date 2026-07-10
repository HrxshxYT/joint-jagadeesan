import { AuditLogEvent, PermissionFlagsBits } from "discord.js";

export const DEFAULT_THRESHOLDS = {
  channelCreate: { limit: 5, windowSec: 10, enabled: true },
  channelDelete: { limit: 3, windowSec: 10, enabled: true },
  channelUpdate: { limit: 6, windowSec: 15, enabled: true },
  roleCreate: { limit: 5, windowSec: 10, enabled: true },
  roleDelete: { limit: 3, windowSec: 10, enabled: true },
  roleUpdateDangerous: { limit: 1, windowSec: 30, enabled: true },
  ban: { limit: 5, windowSec: 15, enabled: true },
  kick: { limit: 5, windowSec: 15, enabled: true },
  prune: { limit: 1, windowSec: 60, enabled: true },
  webhookCreate: { limit: 5, windowSec: 10, enabled: true },
  webhookDelete: { limit: 5, windowSec: 10, enabled: true },
  botAdd: { limit: 1, windowSec: 60, enabled: true },
  guildUpdate: { limit: 2, windowSec: 30, enabled: true },
  emojiDelete: { limit: 5, windowSec: 15, enabled: true },
  stickerDelete: { limit: 5, windowSec: 15, enabled: true },
};

const DIRECT = {
  [AuditLogEvent.ChannelCreate]: "channelCreate",
  [AuditLogEvent.ChannelDelete]: "channelDelete",
  [AuditLogEvent.ChannelUpdate]: "channelUpdate",
  [AuditLogEvent.RoleCreate]: "roleCreate",
  [AuditLogEvent.RoleDelete]: "roleDelete",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.MemberPrune]: "prune",
  [AuditLogEvent.WebhookCreate]: "webhookCreate",
  [AuditLogEvent.WebhookDelete]: "webhookDelete",
  [AuditLogEvent.BotAdd]: "botAdd",
  [AuditLogEvent.GuildUpdate]: "guildUpdate",
  [AuditLogEvent.EmojiDelete]: "emojiDelete",
  [AuditLogEvent.StickerDelete]: "stickerDelete",
};

function grantsAdmin(changes = []) {
  const perm = changes.find((c) => c.key === "permissions");
  if (!perm) return false;
  const admin = PermissionFlagsBits.Administrator;
  const newBits = BigInt(perm.new ?? 0);
  const oldBits = BigInt(perm.old ?? 0);
  return (newBits & admin) === admin && (oldBits & admin) !== admin;
}

export function mapAuditLogEntry(entry) {
  if (entry.action === AuditLogEvent.RoleUpdate) {
    return grantsAdmin(entry.changes) ? { actionKey: "roleUpdateDangerous" } : null;
  }
  const actionKey = DIRECT[entry.action];
  return actionKey ? { actionKey } : null;
}
