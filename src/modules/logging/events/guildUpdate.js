import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { serverUpdateEmbed } from "../embeds.js";

export default {
  name: Events.GuildUpdate,
  async execute(ctx, oldGuild, newGuild) {
    await logEvent(ctx, newGuild, "serverChanges", serverUpdateEmbed(oldGuild, newGuild));
  },
};
