import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { isMusicEnabled } from "../commandKit.js";
import { buildQueueEmbed } from "../queue.js";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the current queue.")
    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1)),
  permissions: [],
  async execute(interaction, ctx) {
    if (!isMusicEnabled(ctx)) {
      await interaction.reply({ embeds: [errorEmbed("Music isn't configured.")], ephemeral: true });
      return;
    }
    const player = ctx.music.getPlayer(interaction.guildId);
    if (!player?.queue?.current) {
      await interaction.reply({ embeds: [errorEmbed("Nothing is playing right now.")], ephemeral: true });
      return;
    }
    const page = (interaction.options.getInteger("page") ?? 1) - 1;
    await interaction.reply({ embeds: [buildQueueEmbed({ player, page })] });
  },
};
