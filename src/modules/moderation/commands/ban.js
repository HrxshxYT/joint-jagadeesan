import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed, warnEmbed } from "../../../lib/embeds.js";
import { withConfirm } from "../confirm.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban"))
    .addIntegerOption((o) =>
      o
        .setName("delete_days")
        .setDescription("Delete this many days of messages (0-7)")
        .setMinValue(0)
        .setMaxValue(7),
    ),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (targetMember) {
      const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);

    await withConfirm({
      interaction,
      awaitFn: ctx?.awaitFn,
      summaryEmbed: warnEmbed(`Ban <@${user.id}>?\n**Reason:** ${reason}`),
      onConfirm: async () => {
        if (guildConfig.dmOnAction && targetMember) {
          await dmTarget(
            user,
            infoEmbed(`You were banned from ${interaction.guild.name}`, `**Reason:** ${reason}`),
            ctx.logger,
          );
        }
        try {
          await interaction.guild.bans.create(user.id, {
            reason,
            deleteMessageSeconds: deleteDays * 86400,
          });
        } catch (err) {
          ctx.logger.error({ err }, "ban failed");
          return errorEmbed("I couldn't ban that user — check my permissions and role position.");
        }
        const record = await ctx.cases.createCase({
          guildId: interaction.guildId,
          type: "ban",
          targetId: user.id,
          moderatorId: interaction.user.id,
          reason,
        });
        return buildCaseEmbed(record);
      },
    });
  },
};
