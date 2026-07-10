import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy } from "../helpers.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change or clear a member's nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) =>
      o.setName("nickname").setDescription("New nickname (leave empty to clear)"),
    ),
  permissions: [PermissionFlagsBits.ManageNicknames],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const nickname = interaction.options.getString("nickname");
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
      await targetMember.setNickname(nickname ?? null, `Changed by ${interaction.user.id}`);
      await interaction.reply({
        embeds: [successEmbed(nickname ? `Nickname set to **${nickname}**.` : "Nickname cleared.")],
      });
    } catch (err) {
      ctx.logger.error({ err }, "nick failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't change that nickname.")],
        ephemeral: true,
      });
    }
  },
};
