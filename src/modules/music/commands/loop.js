import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

const LABEL = { off: "Off", track: "this track", queue: "the queue" };

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set the loop mode.")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("What to loop")
        .setRequired(true)
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Track", value: "track" },
          { name: "Queue", value: "queue" },
        ),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const mode = interaction.options.getString("mode");
    await player.setRepeatMode(mode);
    await interaction.reply(musicNotice(`🔁 Looping **${LABEL[mode]}**.`));
  },
};
