import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { successEmbed, brandEmbed } from "../../../lib/embeds.js";
import { EMOJIS } from "../../../lib/constants.js";
import { runToggler } from "../../../lib/navigator.js";
import { CATEGORIES } from "../categories.js";

function isOn(audit, key) {
  return audit?.events?.[key] !== false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("auditlog")
    .setDescription("One channel that logs every server & member change.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Set the audit-log channel (enables the feed).")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("disable").setDescription("Turn the audit-log feed off."))
    .addSubcommand((s) =>
      s.setName("events").setDescription("Toggle which event categories are tracked."),
    )
    .addSubcommand((s) => s.setName("view").setDescription("Show the audit-log configuration.")),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "channel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateAudit(guildId, { enabled: true, channelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed(`Audit log enabled → all server changes will post to <#${channel.id}>.`)],
      });
      return;
    }

    if (sub === "disable") {
      await ctx.config.updateAudit(guildId, { enabled: false });
      await interaction.reply({ embeds: [successEmbed("Audit log disabled.")] });
      return;
    }

    if (sub === "view") {
      const audit = (await ctx.config.getGuild(guildId)).audit ?? {};
      const lines = CATEGORIES.map(
        (c) => `${isOn(audit, c.key) ? EMOJIS.on : EMOJIS.off} ${c.label}`,
      );
      await interaction.reply({
        embeds: [
          brandEmbed({
            title: `${EMOJIS.log} Audit Log`,
            description:
              `**Status:** ${audit.enabled ? "on" : "off"}\n` +
              `**Channel:** ${audit.channelId ? `<#${audit.channelId}>` : "*not set*"}\n\n` +
              `**Tracked events**\n${lines.join("\n")}`,
          }),
        ],
      });
      return;
    }

    if (sub === "events") {
      let audit = (await ctx.config.getGuild(guildId)).audit ?? { events: {} };
      await runToggler({
        interaction,
        ownerId: interaction.user.id,
        awaitFn: ctx?.awaitFn,
        buildItems: () =>
          CATEGORIES.map((c) => ({ key: c.key, label: c.label, on: isOn(audit, c.key) })),
        renderEmbed: () =>
          brandEmbed({
            title: `${EMOJIS.log} Audit Log — Events`,
            description: "Click to toggle each category on/off.",
          }),
        onToggle: async (key) => {
          const events = { ...(audit.events ?? {}) };
          events[key] = !isOn(audit, key);
          await ctx.config.updateAudit(guildId, { events });
          audit = { ...audit, events };
        },
      });
    }
  },
};
