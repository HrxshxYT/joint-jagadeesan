import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(ctx, client) {
    if (!ctx.music?.isEnabled) {
      ctx.logger.info?.("music disabled (no LAVALINK_HOST configured)");
      return;
    }
    await ctx.music.init(client.user);
    ctx.logger.info?.("lavalink manager initialised");
  },
};
