import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

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
