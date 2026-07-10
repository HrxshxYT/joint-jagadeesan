import { Events } from "discord.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.GuildCreate,
  async execute(ctx, guild) {
    const fresh = await fetchInvitesFor(guild);
    ctx.inviteCache.setGuild(guild.id, fresh);
  },
};
