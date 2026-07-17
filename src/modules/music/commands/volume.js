import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export const MAX_VOLUME = 200;

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set the playback volume (0–200%).")
    .addIntegerOption((o) =>
      o.setName("level").setDescription("Volume percent (0–200)").setRequired(true).setMinValue(0).setMaxValue(MAX_VOLUME),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const level = Math.max(0, Math.min(MAX_VOLUME, interaction.options.getInteger("level")));
    await player.setVolume(level);
    await interaction.reply(musicNotice(`🔊 Volume set to **${level}%**.`));
  },
};
