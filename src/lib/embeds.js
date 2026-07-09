import { EmbedBuilder } from "discord.js";
import { COLORS } from "./constants.js";

export function successEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ ${text}`);
}

export function errorEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${text}`);
}

export function warnEmbed(text) {
  return new EmbedBuilder().setColor(COLORS.warn).setDescription(`⚠️ ${text}`);
}

export function infoEmbed(title, text) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(text);
}
