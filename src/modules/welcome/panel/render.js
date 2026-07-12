import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

const PLACEHOLDERS = "`{mention}` `{user}` `{username}` `{server}` `{memberCount}`";

export function buildWelcomeView(state) {
  const w = state.welcome;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(w.welcomeEnabled || w.goodbyeEnabled ? COLORS.success : COLORS.warn)
    .setTitle("👋 Welcome & Goodbye Panel")
    .setDescription(
      `**Welcome:** ${w.welcomeEnabled ? `🟢 → ${w.welcomeChannelId ? `<#${w.welcomeChannelId}>` : "*no channel*"}` : "🔴 off"}\n` +
        (w.welcomeMessage ? `> ${w.welcomeMessage}\n` : "") +
        `**Goodbye:** ${w.goodbyeEnabled ? `🟢 → ${w.goodbyeChannelId ? `<#${w.goodbyeChannelId}>` : "*no channel*"}` : "🔴 off"}\n` +
        (w.goodbyeMessage ? `> ${w.goodbyeMessage}\n` : "") +
        `\nPlaceholders: ${PLACEHOLDERS}`,
    );

  const tog = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`we:tog:${field}:${o}`)
      .setLabel(`${w[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(w[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    tog("welcomeEnabled", "Welcome"),
    tog("goodbyeEnabled", "Goodbye"),
    new ButtonBuilder().setCustomId(`we:msg:welcome:${o}`).setLabel("Welcome msg…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`we:msg:goodbye:${o}`).setLabel("Goodbye msg…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`we:preview:${o}`).setLabel("Preview").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`we:ch:welcome:${o}`)
      .setPlaceholder("Welcome channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`we:ch:goodbye:${o}`)
      .setPlaceholder("Goodbye channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`we:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}
