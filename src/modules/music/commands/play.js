import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { isMusicEnabled, musicNotice } from "../commandKit.js";
import { memberVoiceChannelId } from "../guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a track or add it to the queue (search text or a URL).")
    .addStringOption((o) =>
      o.setName("query").setDescription("Search terms or a YouTube/SoundCloud/Spotify/Apple link").setRequired(true),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    if (!isMusicEnabled(ctx)) {
      await interaction.reply({
        embeds: [errorEmbed("Music isn't configured — no Lavalink node is set up.")],
        ephemeral: true,
      });
      return;
    }
    const voiceChannelId = memberVoiceChannelId(interaction.member);
    if (!voiceChannelId) {
      await interaction.reply({ embeds: [errorEmbed("Join a voice channel first.")], ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const query = interaction.options.getString("query");

    let player = ctx.music.getPlayer(interaction.guildId);
    if (!player) {
      player = ctx.music.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: 80,
      });
    }
    if (!player.connected) await player.connect();

    const res = await player.search({ query }, interaction.user);
    if (!res || !res.tracks?.length) {
      await interaction.editReply({ embeds: [errorEmbed(`No results for **${query}**.`)] });
      return;
    }

    const isPlaylist = res.loadType === "playlist";
    const added = isPlaylist ? res.tracks : [res.tracks[0]];
    await player.queue.add(added);

    if (!player.playing && !player.paused) await player.play();

    const first = added[0].info;
    const msg = isPlaylist
      ? `➕ Queued **${added.length}** tracks from the playlist.`
      : player.playing || player.paused
        ? `➕ Added **${first.title}** to the queue.`
        : `▶️ Now playing **${first.title}**.`;
    await interaction.editReply(musicNotice(msg));
  },
};
