import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";
import { formatDuration } from "../format.js";

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek to a position in the current track (in seconds).")
    .addIntegerOption((o) =>
      o.setName("seconds").setDescription("Position in seconds from the start").setRequired(true).setMinValue(0),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const current = player.queue.current;
    if (!current || current.info.isStream) {
      await interaction.reply({ embeds: [errorEmbed("This track can't be seeked.")], ephemeral: true });
      return;
    }
    const ms = interaction.options.getInteger("seconds") * 1000;
    if (ms > current.info.duration) {
      await interaction.reply({ embeds: [errorEmbed("That's past the end of the track.")], ephemeral: true });
      return;
    }
    await player.seek(ms);
    await interaction.reply(musicNotice(`⏩ Seeked to **${formatDuration(ms)}**.`));
  },
};
