import { Events } from "discord.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member.guild) return;
    await ctx.invites
      .markLeft(member.guild.id, member.id)
      .catch((err) => ctx.logger.error({ err }, "invite leave tracking failed"));
  },
};
