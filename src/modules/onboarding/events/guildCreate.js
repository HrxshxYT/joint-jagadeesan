import { Events } from "discord.js";
import { sendOnboarding } from "../welcome.js";

export default {
  name: Events.GuildCreate,
  async execute(ctx, guild) {
    // Fire-and-forget: onboarding must never block or crash the join handler.
    sendOnboarding(ctx, guild).catch((err) =>
      ctx.logger?.error?.({ err, guildId: guild?.id }, "onboarding crashed"),
    );
  },
};
