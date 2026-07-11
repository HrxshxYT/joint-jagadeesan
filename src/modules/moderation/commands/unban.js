import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildCaseEmbed } from "../helpers.js";
import { errorEmbed, warnEmbed } from "../../../lib/embeds.js";
import { withConfirm } from "../confirm.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Lift a ban from a user ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("user_id").setDescription("The banned user's ID").setRequired(true),
    )
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the unban")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const userId = interaction.options.getString("user_id");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    await withConfirm({
      interaction,
      awaitFn: ctx?.awaitFn,
      summaryEmbed: warnEmbed(`Unban \`${userId}\`?\n**Reason:** ${reason}`),
      onConfirm: async () => {
        try {
          await interaction.guild.bans.remove(userId, reason);
        } catch (err) {
          ctx.logger.error({ err }, "unban failed");
          return errorEmbed("That user isn't banned, or I lack permission.");
        }
        const record = await ctx.cases.createCase({
          guildId: interaction.guildId,
          type: "unban",
          targetId: userId,
          moderatorId: interaction.user.id,
          reason,
        });
        return buildCaseEmbed(record);
      },
    });
  },
};
