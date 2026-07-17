import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback, clear the queue, and leave."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    await player.destroy();
    await interaction.reply(musicNotice("⏹️ Stopped and left the channel."));
  },
};
