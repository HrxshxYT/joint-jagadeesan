import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock this channel so @everyone cannot send messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
      await interaction.reply({
        embeds: [successEmbed(`🔒 Channel locked. **Reason:** ${reason}`)],
      });
    } catch (err) {
      ctx.logger.error({ err }, "lockdown failed");
      await interaction.reply({
        embeds: [errorEmbed("I couldn't lock this channel.")],
        ephemeral: true,
      });
    }
  },
};
