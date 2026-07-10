export async function revertAction({ actionKey, entry, guild, logger }) {
  try {
    switch (actionKey) {
      case "channelDelete": {
        const t = entry.target ?? {};
        await guild.channels.create({ name: t.name ?? "restored-channel", type: t.type });
        return "channel_recreated";
      }
      case "roleDelete": {
        const t = entry.target ?? {};
        await guild.roles.create({ name: t.name ?? "restored-role" });
        return "role_recreated";
      }
      case "ban": {
        if (entry.targetId) await guild.bans.remove(entry.targetId, "anti-nuke auto-revert");
        return "unbanned";
      }
      default:
        return "no_revert";
    }
  } catch (err) {
    logger.error({ err, actionKey }, "anti-nuke auto-revert failed");
    return "failed";
  }
}
