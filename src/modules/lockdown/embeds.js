import { EmbedBuilder } from "discord.js";
import { COLORS, BOT_NAME } from "../../lib/constants.js";
import { brandEmbed } from "../../lib/embeds.js";
import { formatDuration } from "../../lib/duration.js";

function failList(failed = []) {
  if (!failed.length) return null;
  const items = failed.slice(0, 10).map((f) => `\`${f.item}\``).join(", ");
  const more = failed.length > 10 ? ` (+${failed.length - 10} more)` : "";
  return `${items}${more}`;
}

export function lockResultEmbed({ tier, reason, actorId, durationMs, counts = {}, failed = [] }) {
  const fields = [
    { name: "Tier", value: `\`${tier}\``, inline: true },
    { name: "By", value: `<@${actorId}>`, inline: true },
    { name: "Duration", value: durationMs ? formatDuration(durationMs) : "until unlocked", inline: true },
    { name: "Reason", value: reason ?? "No reason provided" },
  ];
  if (counts.snapshots != null) {
    fields.push({ name: "Overwrites touched", value: String(counts.snapshots), inline: true });
  }
  const fail = failList(failed);
  if (fail) fields.push({ name: `Failed (${failed.length})`, value: fail });

  return new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle("🔒 Server locked down")
    .addFields(fields)
    .setFooter({ text: BOT_NAME })
    .setTimestamp();
}

export function unlockResultEmbed({ actorId, counts = {}, failed = [] }) {
  const fields = [
    { name: "By", value: `<@${actorId}>`, inline: true },
    { name: "Restored", value: String(counts.restored ?? 0), inline: true },
  ];
  const fail = failList(failed);
  if (fail) fields.push({ name: `Failed (${failed.length})`, value: fail });
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("🔓 Lockdown lifted")
    .addFields(fields)
    .setFooter({ text: BOT_NAME })
    .setTimestamp();
}

export function statusEmbed(state) {
  if (!state || state.status !== "active") {
    return brandEmbed({ title: "Lockdown status", description: "✅ No active lockdown." });
  }
  const expires = state.expiresAt
    ? `<t:${Math.floor(new Date(state.expiresAt).getTime() / 1000)}:R>`
    : "manual (no expiry)";
  return brandEmbed({
    title: "🔒 Lockdown active",
    fields: [
      { name: "Tier", value: `\`${state.tier}\``, inline: true },
      { name: "By", value: `<@${state.startedById}>`, inline: true },
      { name: "Expires", value: expires, inline: true },
      { name: "Started", value: `<t:${Math.floor(new Date(state.startedAt).getTime() / 1000)}:f>`, inline: true },
      { name: "Invites paused", value: state.invitesPausedByUs ? "yes (by us)" : "no", inline: true },
      { name: "Reason", value: state.reason ?? "No reason provided" },
    ],
  });
}
