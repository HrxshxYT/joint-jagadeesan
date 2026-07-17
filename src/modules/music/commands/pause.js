import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause the current track."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    if (player.paused) {
      await interaction.reply(musicNotice("⏸️ Already paused."));
      return;
    }
    await player.pause();
    await interaction.reply(musicNotice("⏸️ Paused."));
  },
};
