import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, infoEmbed } from "../../../lib/embeds.js";

const PLACEHOLDERS = "`{mention}` `{user}` `{username}` `{server}` `{memberCount}`";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome & goodbye messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("set-channel")
        .setDescription("Set the welcome channel (enables welcomes).")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("set-message")
        .setDescription("Set the welcome message template.")
        .addStringOption((o) =>
          o.setName("text").setDescription("Template — supports placeholders").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("goodbye-channel")
        .setDescription("Set the goodbye channel (enables goodbyes).")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("goodbye-message")
        .setDescription("Set the goodbye message template.")
        .addStringOption((o) =>
          o.setName("text").setDescription("Template — supports placeholders").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("disable").setDescription("Disable both welcome and goodbye messages."),
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("Show current welcome/goodbye settings."),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "set-channel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateWelcome(guildId, {
        welcomeEnabled: true,
        welcomeChannelId: channel.id,
      });
      await interaction.reply({
        embeds: [successEmbed(`Welcome messages will be sent to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "set-message") {
      const text = interaction.options.getString("text");
      await ctx.config.updateWelcome(guildId, { welcomeMessage: text });
      await interaction.reply({
        embeds: [successEmbed(`Welcome message updated.\nPlaceholders: ${PLACEHOLDERS}`)],
      });
      return;
    }
    if (sub === "goodbye-channel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateWelcome(guildId, {
        goodbyeEnabled: true,
        goodbyeChannelId: channel.id,
      });
      await interaction.reply({
        embeds: [successEmbed(`Goodbye messages will be sent to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "goodbye-message") {
      const text = interaction.options.getString("text");
      await ctx.config.updateWelcome(guildId, { goodbyeMessage: text });
      await interaction.reply({
        embeds: [successEmbed(`Goodbye message updated.\nPlaceholders: ${PLACEHOLDERS}`)],
      });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateWelcome(guildId, { welcomeEnabled: false, goodbyeEnabled: false });
      await interaction.reply({ embeds: [successEmbed("Welcome & goodbye messages disabled.")] });
      return;
    }
    if (sub === "view") {
      const { welcome } = await ctx.config.getGuild(guildId);
      const w = welcome ?? {};
      const lines = [
        `**Welcome:** ${w.welcomeEnabled ? `on → <#${w.welcomeChannelId}>` : "off"}`,
        w.welcomeMessage ? `> ${w.welcomeMessage}` : null,
        `**Goodbye:** ${w.goodbyeEnabled ? `on → <#${w.goodbyeChannelId}>` : "off"}`,
        w.goodbyeMessage ? `> ${w.goodbyeMessage}` : null,
        `\nPlaceholders: ${PLACEHOLDERS}`,
      ].filter(Boolean);
      await interaction.reply({ embeds: [infoEmbed("Welcome settings", lines.join("\n"))] });
    }
  },
};
