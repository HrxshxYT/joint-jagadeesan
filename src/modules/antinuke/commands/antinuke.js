import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { buildStatusEmbed } from "../statusEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Configure the anti-nuke protection system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable anti-nuke."))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable anti-nuke."))
    .addSubcommand((s) => s.setName("status").setDescription("Show current anti-nuke settings."))
    .addSubcommand((s) =>
      s
        .setName("panic")
        .setDescription("Toggle panic mode (any single destructive action triggers).")
        .addStringOption((o) =>
          o
            .setName("state")
            .setDescription("on or off")
            .setRequired(true)
            .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("punishment")
        .setDescription("Set the punishment applied to a detected nuker.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Punishment")
            .setRequired(true)
            .addChoices(
              { name: "ban", value: "ban" },
              { name: "kick", value: "kick" },
              { name: "strip roles", value: "strip" },
              { name: "quarantine", value: "quarantine" },
              { name: "remove perms", value: "removeperms" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("alertchannel")
        .setDescription("Set the channel for anti-nuke incident alerts.")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Alert channel").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("whitelist")
        .setDescription("Add or remove a trusted user/role that bypasses anti-nuke.")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("add or remove")
            .setRequired(true)
            .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
        )
        .addMentionableOption((o) =>
          o.setName("target").setDescription("User or role").setRequired(true),
        ),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "enable") {
      await ctx.config.updateAntinuke(guildId, { enabled: true });
      await interaction.reply({ embeds: [successEmbed("Anti-nuke is now **enabled**.")] });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateAntinuke(guildId, { enabled: false });
      await interaction.reply({ embeds: [successEmbed("Anti-nuke is now **disabled**.")] });
      return;
    }
    if (sub === "panic") {
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateAntinuke(guildId, { panicMode: on });
      await interaction.reply({
        embeds: [successEmbed(`Panic mode is now **${on ? "ON" : "off"}**.`)],
      });
      return;
    }
    if (sub === "punishment") {
      const type = interaction.options.getString("type");
      await ctx.config.updateAntinuke(guildId, { punishment: type });
      await interaction.reply({ embeds: [successEmbed(`Punishment set to \`${type}\`.`)] });
      return;
    }
    if (sub === "alertchannel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateAntinuke(guildId, { alertChannelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed(`Alerts will be sent to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "whitelist") {
      const action = interaction.options.getString("action");
      const target = interaction.options.getMentionable("target");
      // A role mentionable exposes `.permissions` and lacks user-only fields.
      const type =
        "permissions" in target && !("username" in target) && !("bot" in target) ? "role" : "user";
      if (action === "add") {
        await ctx.config.addWhitelist(guildId, target.id, type, interaction.user?.id ?? "unknown");
        await interaction.reply({
          embeds: [successEmbed(`Added <@${target.id}> to the whitelist.`)],
        });
      } else {
        await ctx.config.removeWhitelist(guildId, target.id);
        await interaction.reply({
          embeds: [successEmbed(`Removed \`${target.id}\` from the whitelist.`)],
        });
      }
      return;
    }
    if (sub === "status") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildStatusEmbed(guildConfig)] });
      return;
    }
  },
};
