import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume the paused track."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    await player.resume();
    await interaction.reply(musicNotice("▶️ Resumed."));
  },
};
