import { Events } from "discord.js";
import { processMemberJoin } from "../members.js";
import { realDeps } from "../deps.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    const guildConfig = await ctx.config.getGuild(member.guild.id);
    await processMemberJoin({
      member,
      guildConfig,
      deps: realDeps(ctx.logger),
      logger: ctx.logger,
    });
  },
};
