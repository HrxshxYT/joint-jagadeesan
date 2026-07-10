export function realDeps(logger) {
  return {
    async assignRoles(member, roleIds) {
      try {
        await member.roles.add(roleIds, "Autorole on join");
      } catch (err) {
        logger.error({ err }, "autorole assignment failed");
      }
    },
    async sendMessage(guild, channelId, content) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ content, allowedMentions: { parse: ["users"] } }).catch(() => {});
      }
    },
  };
}
