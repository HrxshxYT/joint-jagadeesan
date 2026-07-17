import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip to the next track."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    await player.skip(0, false);
    await interaction.reply(musicNotice("⏭️ Skipped."));
  },
};
