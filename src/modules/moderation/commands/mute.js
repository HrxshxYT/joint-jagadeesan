import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Apply the configured mute role to a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (!guildConfig.muteRoleId) {
      await interaction.reply({
        embeds: [errorEmbed("No mute role is set. An admin can set one with `/config muterole`.")],
        ephemeral: true,
      });
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

    if (guildConfig.dmOnAction) {
      await dmTarget(
        user,
        infoEmbed(`You were muted in ${interaction.guild.name}`, `**Reason:** ${reason}`),
        ctx.logger,
      );
    }

    try {
      await targetMember.roles.add(guildConfig.muteRoleId, reason);
    } catch (err) {
      ctx.logger.error({ err }, "mute failed");
      await interaction.reply({
        embeds: [
          errorEmbed("I couldn't apply the mute role — check my permissions and role position."),
        ],
        ephemeral: true,
      });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "mute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
