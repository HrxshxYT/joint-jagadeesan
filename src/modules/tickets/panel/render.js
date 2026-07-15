// src/modules/tickets/panel/render.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

const btn = (id, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

export function buildTicketsView(state) {
  return state.view === "panel" ? panelView(state) : homeView(state);
}

function homeView(state) {
  const o = state.ownerId;
  const c = state.config;
  const embed = new EmbedBuilder()
    .setColor(c.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🎫 Ticket System")
    .setDescription(
      `**Status:** ${c.enabled ? "🟢 enabled" : "🔴 disabled"}\n` +
        `**Transcripts →** ${c.transcriptChannelId ? `<#${c.transcriptChannelId}>` : "*not set*"} ` +
        `${c.dmTranscript ? "(also DM opener)" : ""}\n` +
        `**Log channel →** ${c.logChannelId ? `<#${c.logChannelId}>` : "*not set*"}\n` +
        `**Max open / user / category:** ${c.maxOpenPerUser === 0 ? "unlimited" : c.maxOpenPerUser}\n\n` +
        `**Panels:** ${state.panels.length}`,
    );

  const row1 = new ActionRowBuilder().addComponents(
    btn(`tk:tog:enabled:${o}`, `${c.enabled ? EMOJIS.on : EMOJIS.off} Enabled`, c.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    btn(`tk:tog:dmTranscript:${o}`, `${c.dmTranscript ? EMOJIS.on : EMOJIS.off} DM transcript`, c.dmTranscript ? ButtonStyle.Success : ButtonStyle.Secondary),
    btn(`tk:maxopen:${o}`, "Max open…"),
    btn(`tk:newpanel:${o}`, "➕ New Panel", ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`tk:transcriptch:${o}`)
      .setPlaceholder("Transcript channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(1),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`tk:logch:${o}`)
      .setPlaceholder("Log channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(1),
  );

  const rows = [row1, row2, row3];
  if (state.panels.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`tk:selpanel:${o}`)
      .setPlaceholder("Edit a panel…")
      .addOptions(
        state.panels.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.name)
            .setValue(p.id)
            .setDescription(`${p.categories?.length ?? 0} categories${p.messageId ? " · published" : ""}`.slice(0, 100)),
        ),
      );
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(btn(`tk:close:${o}`, "Close", ButtonStyle.Danger)));
  return { embeds: [embed], components: rows };
}

function panelView(state) {
  const o = state.ownerId;
  const panel = state.panels.find((p) => p.id === state.selectedPanelId);
  if (!panel) return homeView(state);

  const cats = panel.categories ?? [];
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`🎫 Panel — ${panel.name}`)
    .setDescription(
      `**Title:** ${panel.title}\n**Description:** ${panel.description}\n` +
        `**Published:** ${panel.messageId ? `🟢 <#${panel.channelId}>` : "🔴 not published"}\n\n` +
        `**Categories (${cats.length}):**\n` +
        (cats.length
          ? cats.map((c) => `• ${c.emoji ? `${c.emoji} ` : ""}**${c.label}** → prefix \`${c.namePrefix}\``).join("\n")
          : "*none yet — add one before publishing*"),
    );

  const row1 = new ActionRowBuilder().addComponents(
    btn(`tk:editmeta:${o}`, "Edit title/desc…"),
    btn(`tk:addcat:${o}`, "➕ Add category", ButtonStyle.Primary),
    btn(`tk:publish:${o}`, panel.messageId ? "📢 Re-publish" : "📢 Publish", ButtonStyle.Success),
    btn(`tk:delpanel:${o}`, "🗑 Delete", ButtonStyle.Danger),
  );

  const rows = [row1];
  if (cats.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`tk:selcat:${o}`)
      .setPlaceholder("Edit a category…")
      .addOptions(
        cats.map((c) =>
          new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.id).setDescription(
            (c.description ?? `prefix ${c.namePrefix}`).slice(0, 100),
          ),
        ),
      );
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(btn(`tk:back:${o}`, "⬅ Back", ButtonStyle.Secondary)));
  return { embeds: [embed], components: rows };
}
