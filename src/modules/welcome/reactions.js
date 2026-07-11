export async function handleReaction({
  reaction,
  user,
  action,
  service,
  resolveMember,
  assignRole,
  removeRole,
  logger,
}) {
  try {
    if (user.bot) return;
    const guildId = reaction.message.guild?.id ?? reaction.message.guildId;
    if (!guildId) return;

    const key = reaction.emoji.id ?? reaction.emoji.name;
    const mapping = await service.find(guildId, reaction.message.id, key);
    if (!mapping) return;

    const member = await resolveMember(guildId, user.id);
    if (!member) return;

    if (action === "add") await assignRole(member, mapping.roleId);
    else await removeRole(member, mapping.roleId);
  } catch (err) {
    logger.error({ err }, "reaction-role handling failed");
  }
}
