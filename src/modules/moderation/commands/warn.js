import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { dmTarget, buildCaseEmbed } from "../helpers.js";
import { infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(
        user,
        infoEmbed(`You were warned in ${interaction.guild.name}`, `**Reason:** ${reason}`),
        ctx.logger,
      );
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "warn",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
