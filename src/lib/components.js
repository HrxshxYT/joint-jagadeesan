import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { EMOJIS } from "./constants.js";

export function paginate(items, pageSize) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

export function pageRow({ page, pageCount, ownerId }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page:prev:${ownerId}`)
      .setLabel("Prev")
      .setEmoji(EMOJIS.prev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`page:ind:${ownerId}`)
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page:next:${ownerId}`)
      .setLabel("Next")
      .setEmoji(EMOJIS.next)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
  );
}

export function confirmRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:yes:${ownerId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`confirm:no:${ownerId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function toggleRow(items, ownerId) {
  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((it) =>
          new ButtonBuilder()
            .setCustomId(`toggle:${it.key}:${ownerId}`)
            .setLabel(`${it.on ? EMOJIS.on : EMOJIS.off} ${it.label}`)
            .setStyle(it.on ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function ownerFilter(interaction, ownerId) {
  return interaction.user?.id === ownerId;
}
