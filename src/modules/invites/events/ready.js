import { Events } from "discord.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(ctx, client) {
    for (const guild of client.guilds.cache.values()) {
      const fresh = await fetchInvitesFor(guild);
      ctx.inviteCache.setGuild(guild.id, fresh);
    }
    ctx.logger.info?.("invite cache seeded");
  },
};
