import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, buildCaseEmbed } from "../helpers.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove the configured mute role from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to unmute").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (!guildConfig.muteRoleId) {
      await interaction.reply({ embeds: [errorEmbed("No mute role is set.")], ephemeral: true });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({
        embeds: [errorEmbed("That user is not in this server.")],
        ephemeral: true,
      });
      return;
    }
    const check = checkHierarchy({
      actorMember: interaction.member,
      targetMember,
      botMember: interaction.guild.members.me,
    });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    try {
      await targetMember.roles.remove(guildConfig.muteRoleId, reason);
    } catch (err) {
      ctx.logger.error({ err }, "unmute failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't remove the mute role.")],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "unmute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
