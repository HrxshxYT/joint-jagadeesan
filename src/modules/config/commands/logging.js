import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { COLORS } from "../../../lib/constants.js";

const CATEGORIES = [
  "memberJoinLeave",
  "messageEdit",
  "messageDelete",
  "modActions",
  "roleChanges",
  "channelChanges",
  "voice",
  "serverChanges",
];

const categoryChoices = CATEGORIES.map((c) => ({ name: c, value: c }));

export default {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure event logging channels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Route a log category to a channel.")
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Event category")
            .setRequired(true)
            .addChoices(...categoryChoices),
        )
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Target channel").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("disable")
        .setDescription("Disable a log category.")
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Event category")
            .setRequired(true)
            .addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("enable")
        .setDescription("Re-enable a disabled log category.")
        .addStringOption((o) =>
          o
            .setName("category")
            .setDescription("Event category")
            .setRequired(true)
            .addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("Show current logging configuration."),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "set") {
      const category = interaction.options.getString("category");
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateLogging(guildId, { [category]: channel.id });
      await interaction.reply({
        embeds: [successEmbed(`\`${category}\` logs will go to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "disable" || sub === "enable") {
      const category = interaction.options.getString("category");
      const guildConfig = await ctx.config.getGuild(guildId);
      const current = new Set(guildConfig.logging?.disabled ?? []);
      if (sub === "disable") current.add(category);
      else current.delete(category);
      await ctx.config.updateLogging(guildId, { disabled: [...current] });
      await interaction.reply({
        embeds: [
          successEmbed(
            `\`${category}\` logging **${sub === "disable" ? "disabled" : "enabled"}**.`,
          ),
        ],
      });
      return;
    }
    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      const logging = guildConfig.logging ?? {};
      const disabled = new Set(logging.disabled ?? []);
      const embed = new EmbedBuilder().setColor(COLORS.info).setTitle("📋 Logging Configuration");
      embed.setDescription(
        CATEGORIES.map((c) => {
          const channelId = logging[c];
          const state = disabled.has(c) ? "disabled" : channelId ? `<#${channelId}>` : "unset";
          return `**${c}:** ${state}`;
        }).join("\n"),
      );
      await interaction.reply({ embeds: [embed] });
    }
  },
};
