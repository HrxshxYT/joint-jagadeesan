import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

export default {
  data: new SlashCommandBuilder().setName("clear").setDescription("Clear the upcoming queue (keeps the current track)."),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const count = player.queue.tracks.length;
    await player.queue.splice(0, count);
    await interaction.reply(musicNotice(`🧹 Cleared **${count}** track${count === 1 ? "" : "s"} from the queue.`));
  },
};
