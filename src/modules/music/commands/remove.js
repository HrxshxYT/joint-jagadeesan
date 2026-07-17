import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a track from the queue by its position.")
    .addIntegerOption((o) =>
      o.setName("position").setDescription("Queue position (see /queue)").setRequired(true).setMinValue(1),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const position = interaction.options.getInteger("position");
    const track = player.queue.tracks[position - 1];
    if (!track) {
      await interaction.reply({ embeds: [errorEmbed(`No track at position **${position}**.`)], ephemeral: true });
      return;
    }
    await player.queue.splice(position - 1, 1);
    await interaction.reply(musicNotice(`🗑️ Removed **${track.info.title}** from the queue.`));
  },
};
