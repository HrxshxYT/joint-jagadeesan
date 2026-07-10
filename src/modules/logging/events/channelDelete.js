import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { channelEmbed } from "../embeds.js";

export default {
  name: Events.ChannelDelete,
  async execute(ctx, channel) {
    if (!channel.guild) return;
    await logEvent(ctx, channel.guild, "channelChanges", channelEmbed(channel, "deleted"));
  },
};
