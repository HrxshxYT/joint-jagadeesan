import { Events } from "discord.js";
import { processMemberLeave } from "../members.js";
import { realDeps } from "../deps.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    const guildConfig = await ctx.config.getGuild(member.guild.id);
    await processMemberLeave({
      member,
      guildConfig,
      deps: realDeps(ctx.logger),
      logger: ctx.logger,
    });
  },
};
