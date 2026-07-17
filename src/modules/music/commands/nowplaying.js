import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { isMusicEnabled } from "../commandKit.js";
import { buildNowPlaying } from "../nowPlaying.js";

export default {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the track that's currently playing."),
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
    await interaction.reply(buildNowPlaying({ player }));
  },
};
