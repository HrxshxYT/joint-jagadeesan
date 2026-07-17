import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    await player.queue.shuffle();
    await interaction.reply(musicNotice("🔀 Shuffled the queue."));
  },
};
