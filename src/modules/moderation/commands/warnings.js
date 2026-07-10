import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { COLORS } from "../../../lib/constants.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("List a member's moderation history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to look up").setRequired(true)),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const cases = await ctx.cases.listCases(interaction.guildId, user.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`Moderation history — ${user.id}`);

    if (cases.length === 0) {
      embed.setDescription("No cases on record. ✨");
    } else {
      embed.setDescription(
        cases
          .map((c) => `**#${c.caseNumber}** \`${c.type}\` — ${c.reason} (by <@${c.moderatorId}>)`)
          .slice(0, 25)
          .join("\n"),
      );
    }
    await interaction.reply({ embeds: [embed] });
  },
};
