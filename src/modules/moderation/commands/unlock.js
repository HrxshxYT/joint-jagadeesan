import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
      });
      await interaction.reply({ embeds: [successEmbed("🔓 Channel unlocked.")] });
    } catch (err) {
      ctx.logger.error({ err }, "unlock failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't unlock this channel.")],
        ephemeral: true,
      });
    }
  },
};
