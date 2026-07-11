import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelType,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";
import { buildWhitelistEmbed } from "../statusEmbed.js";

export const PUNISHMENTS = [
  ["ban", "Ban"],
  ["kick", "Kick"],
  ["strip", "Strip roles"],
  ["quarantine", "Quarantine"],
  ["removeperms", "Remove perms"],
];

export function buildMainView(state) {
  const a = state.antinuke;
  const o = state.ownerId;

  const embed = new EmbedBuilder()
    .setColor(a.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🛡️ Anti-Nuke Control Panel")
    .setDescription(
      `${a.enabled ? "🟢 ON" : "🔴 OFF"} · Punish: \`${a.punishment ?? "ban"}\`\n` +
        `Alert: ${a.alertChannelId ? `<#${a.alertChannelId}>` : "*none*"} · ` +
        `Quarantine: ${a.quarantineRoleId ? `<@&${a.quarantineRoleId}>` : "*none*"}\n` +
        `Anti-raid: ${
          a.antiRaidEnabled ? `on (${a.raidJoinCount ?? 10} joins / ${a.raidWindowSec ?? 10}s)` : "off"
        } · Whitelist: ${state.whitelist.length}`,
    );

  const toggle = (field, label) =>
    new ButtonBuilder()
      .setCustomId(`an:tog:${field}:${o}`)
      .setLabel(`${a[field] ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(a[field] ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(
    toggle("enabled", "Enabled"),
    toggle("panicMode", "Panic"),
    toggle("autoRevert", "Auto-revert"),
    toggle("antiRaidEnabled", "Anti-raid"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`an:sel:punishment:${o}`)
      .setPlaceholder("Punishment on detection")
      .addOptions(
        PUNISHMENTS.map(([value, label]) => ({
          label,
          value,
          default: (a.punishment ?? "ban") === value,
        })),
      ),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`an:sel:alert:${o}`)
      .setPlaceholder("Alert channel")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`an:sel:qrole:${o}`)
      .setPlaceholder("Quarantine role")
      .setMinValues(1)
      .setMaxValues(1),
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`an:adv:${o}`).setLabel("Advanced…").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`an:wl:open:${o}`).setLabel("Whitelist").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

export function buildWhitelistView(state) {
  const o = state.ownerId;
  const embed = buildWhitelistEmbed(state.whitelist);

  const rows = [
    new ActionRowBuilder().addComponents(
      new MentionableSelectMenuBuilder()
        .setCustomId(`an:wl:add:${o}`)
        .setPlaceholder("Add a user or role…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];

  if (state.whitelist.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`an:wl:remove:${o}`)
          .setPlaceholder("Remove an entry…")
          .addOptions(
            state.whitelist.slice(0, 25).map((e) => ({
              label: `${e.type === "role" ? "Role" : "User"} ${e.targetId}`,
              value: e.targetId,
            })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`an:wl:back:${o}`).setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`an:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
    ),
  );

  return { embeds: [embed], components: rows };
}
