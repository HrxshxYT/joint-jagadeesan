import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed } from "../../../lib/embeds.js";
import { buildConfigEmbed } from "../statusEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure the bot for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("view").setDescription("Show current configuration."))
    .addSubcommand((s) =>
      s
        .setName("modrole")
        .setDescription("Add or remove a moderator role.")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("add or remove")
            .setRequired(true)
            .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
        )
        .addRoleOption((o) => o.setName("role").setDescription("The role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("dmonaction")
        .setDescription("Whether to DM users when they are moderated.")
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
        .setName("muterole")
        .setDescription("Set the mute role (leave empty to clear).")
        .addRoleOption((o) => o.setName("role").setDescription("The mute role")),
    )
    .addSubcommand((s) =>
      s.setName("reset").setDescription("Reset ALL bot configuration for this server."),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildConfigEmbed(guildConfig)] });
      return;
    }
    if (sub === "modrole") {
      const action = interaction.options.getString("action");
      const role = interaction.options.getRole("role");
      if (action === "add") {
        await ctx.config.addModRole(guildId, role.id);
        await interaction.reply({ embeds: [successEmbed(`Added <@&${role.id}> as a mod role.`)] });
      } else {
        await ctx.config.removeModRole(guildId, role.id);
        await interaction.reply({ embeds: [successEmbed(`Removed <@&${role.id}> as a mod role.`)] });
      }
      return;
    }
    if (sub === "dmonaction") {
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateGuild(guildId, { dmOnAction: on });
      await interaction.reply({
        embeds: [successEmbed(`DM-on-action is now **${on ? "on" : "off"}**.`)],
      });
      return;
    }
    if (sub === "muterole") {
      const role = interaction.options.getRole("role");
      await ctx.config.updateGuild(guildId, { muteRoleId: role ? role.id : null });
      await interaction.reply({
        embeds: [successEmbed(role ? `Mute role set to <@&${role.id}>.` : "Mute role cleared.")],
      });
      return;
    }
    if (sub === "reset") {
      await ctx.config.resetGuildConfig(guildId);
      await interaction.reply({
        embeds: [successEmbed("All configuration has been reset to defaults.")],
      });
    }
  },
};
