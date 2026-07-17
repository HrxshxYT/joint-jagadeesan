import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay — keep playing related tracks when the queue ends."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const next = !player.get("autoplay");
    player.set("autoplay", next);
    await interaction.reply(musicNotice(next ? "♾️ Autoplay **on**." : "⏹️ Autoplay **off**."));
  },
};
