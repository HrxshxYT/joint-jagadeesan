import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Roles automatically given to new members.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a role to auto-assign on join.")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop auto-assigning a role.")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List the auto-assigned roles.")),
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const role = interaction.options.getRole("role");
      await ctx.config.addAutoRole(guildId, role.id);
      await interaction.reply({
        embeds: [successEmbed(`<@&${role.id}> will be given to new members.`)],
      });
      return;
    }
    if (sub === "remove") {
      const role = interaction.options.getRole("role");
      await ctx.config.removeAutoRole(guildId, role.id);
      await interaction.reply({ embeds: [successEmbed(`<@&${role.id}> removed from autoroles.`)] });
      return;
    }
    if (sub === "list") {
      const { autoRoles } = await ctx.config.getGuild(guildId);
      const list = (autoRoles ?? []).map((r) => `<@&${r.roleId}>`).join(", ") || "_None set._";
      await interaction.reply({ embeds: [infoEmbed("Autoroles", list)] });
    }
  },
};
