import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildAutomodEmbed(config = {}) {
  const on = (v) => (v ? "✅" : "❌");
  return new EmbedBuilder()
    .setColor(config.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🤖 Auto-Moderation")
    .addFields(
      { name: "Enabled", value: config.enabled ? "✅ Yes" : "❌ No", inline: true },
      { name: "Action", value: `\`${config.action ?? "delete"}\``, inline: true },
      {
        name: "Filters",
        value:
          `${on(config.antiSpam)} spam  ${on(config.antiMentionSpam)} mentions  ` +
          `${on(config.filterInvites)} invites  ${on(config.filterLinks)} links  ` +
          `${on(config.antiCaps)} caps  ${on(config.antiEmojiSpam)} emoji`,
      },
    );
}
