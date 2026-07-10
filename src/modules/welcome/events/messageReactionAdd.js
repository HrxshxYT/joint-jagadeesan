import { Events } from "discord.js";
import { handleReaction } from "../reactions.js";

function memberResolver(ctx) {
  return async (guildId, userId) => {
    const guild = await ctx.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;
    return guild.members.fetch(userId).catch(() => null);
  };
}

export default {
  name: Events.MessageReactionAdd,
  async execute(ctx, reaction, user) {
    if (reaction.partial) {
      const ok = await reaction.fetch().catch(() => null);
      if (!ok) return;
    }
    await handleReaction({
      reaction,
      user,
      action: "add",
      service: ctx.reactionRoles,
      resolveMember: memberResolver(ctx),
      assignRole: (member, roleId) => member.roles.add(roleId, "Reaction role").catch(() => {}),
      removeRole: (member, roleId) => member.roles.remove(roleId, "Reaction role").catch(() => {}),
      logger: ctx.logger,
    });
  },
};
