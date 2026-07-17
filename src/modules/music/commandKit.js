import { EmbedBuilder } from "discord.js";
import { errorEmbed } from "../../lib/embeds.js";
import { COLORS } from "../../lib/constants.js";
import { sameVoiceChannel } from "./guards.js";

function reject(interaction, text) {
  return interaction.reply({ embeds: [errorEmbed(text)], ephemeral: true });
}

// A purple confirmation embed for music actions (kept off the green success cue).
export function musicNotice(text) {
  return { embeds: [new EmbedBuilder().setColor(COLORS.brand).setDescription(text)] };
}

export function isMusicEnabled(ctx) {
  return Boolean(ctx.music?.isEnabled);
}

// Resolves the guild's active player for a control command, or replies with the
// right ephemeral error and returns null. Enforces the same-voice-channel rule.
export async function getActivePlayer(interaction, ctx) {
  if (!isMusicEnabled(ctx)) {
    await reject(interaction, "Music isn't configured — no Lavalink node is set up.");
    return null;
  }
  const player = ctx.music.getPlayer(interaction.guildId);
  if (!player) {
    await reject(interaction, "Nothing is playing right now.");
    return null;
  }
  if (!sameVoiceChannel(interaction.member, player)) {
    await reject(interaction, "Join my voice channel to control playback.");
    return null;
  }
  return player;
}
