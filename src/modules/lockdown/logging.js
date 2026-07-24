import { logEvent } from "../logging/dispatcher.js";

// Emit a lockdown embed to the moderation logging category and, when configured,
// the anti-nuke alert channel.
export async function emitLockdownLog(ctx, guild, embed, { alertChannelId } = {}) {
  await logEvent(ctx, guild, "modActions", embed).catch((err) =>
    ctx.logger?.error?.({ err }, "lockdown modActions log failed"),
  );
  if (alertChannelId) {
    try {
      const channel = await guild.channels.fetch(alertChannelId);
      if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
    } catch (err) {
      ctx.logger?.error?.({ err, alertChannelId }, "lockdown alert-channel log failed");
    }
  }
}
