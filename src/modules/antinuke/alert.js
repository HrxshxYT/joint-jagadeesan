import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildIncidentEmbed({ actionKey, executorId, count, punishment }) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("🚨 Anti-Nuke Triggered")
    .setDescription(`Detected excessive **${actionKey}** activity and took protective action.`)
    .addFields(
      { name: "Executor", value: `<@${executorId}> (\`${executorId}\`)`, inline: true },
      { name: "Events", value: String(count), inline: true },
      { name: "Action taken", value: `\`${punishment}\``, inline: true },
    )
    .setTimestamp();
}

export async function sendAlert(
  { guild, channelId, actionKey, executorId, count, punishment },
  logger,
) {
  if (!channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({
        embeds: [buildIncidentEmbed({ actionKey, executorId, count, punishment })],
      });
      return true;
    }
  } catch (err) {
    logger?.error({ err, channelId }, "anti-nuke alert send failed");
  }
  return false;
}
