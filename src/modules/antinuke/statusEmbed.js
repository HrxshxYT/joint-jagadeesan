import { EmbedBuilder } from "discord.js";
import { COLORS, LIMITS } from "../../lib/constants.js";

export function buildStatusEmbed(guildConfig) {
  const a = guildConfig.antinuke ?? {};
  const wl = guildConfig.whitelist ?? [];
  return new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke Status")
    .addFields(
      { name: "Enabled", value: a.enabled ? "✅ Yes" : "❌ No", inline: true },
      { name: "Punishment", value: `\`${a.punishment ?? "ban"}\``, inline: true },
      { name: "Panic mode", value: a.panicMode ? "🚨 ON" : "off", inline: true },
      { name: "Auto-revert", value: a.autoRevert ? "on" : "off", inline: true },
      { name: "Alert channel", value: a.alertChannelId ? `<#${a.alertChannelId}>` : "none", inline: true },
      { name: "Whitelist entries", value: String(wl.length), inline: true },
    );
}

// Joins a list of mentions into a single field value, trimming to Discord's
// per-field character limit and noting how many entries were left off.
function mentionList(mentions) {
  const lines = [];
  let length = 0;
  for (let i = 0; i < mentions.length; i++) {
    const line = mentions[i];
    const remaining = mentions.length - i;
    const suffix = remaining > 1 ? `\n…and ${remaining} more` : "";
    if (length + line.length + 1 + suffix.length > LIMITS.embedFieldValue) {
      lines.push(`…and ${remaining} more`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return lines.join("\n");
}

export function buildWhitelistEmbed(whitelist = []) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("🛡️ Anti-Nuke Whitelist");

  if (!whitelist.length) {
    return embed.setDescription(
      "No trusted users or roles are whitelisted.\nAdd one with `/antinuke whitelist add`.",
    );
  }

  const users = whitelist.filter((e) => e.type === "user").map((e) => `<@${e.targetId}>`);
  const roles = whitelist.filter((e) => e.type === "role").map((e) => `<@&${e.targetId}>`);

  if (users.length) {
    embed.addFields({ name: `👤 Users (${users.length})`, value: mentionList(users) });
  }
  if (roles.length) {
    embed.addFields({ name: `🎭 Roles (${roles.length})`, value: mentionList(roles) });
  }

  return embed.setFooter({
    text: `${whitelist.length} ${whitelist.length === 1 ? "entry" : "entries"} bypass anti-nuke`,
  });
}
