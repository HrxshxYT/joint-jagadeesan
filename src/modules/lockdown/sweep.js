// Auto-unlock expired lockdowns. Rides the existing once-per-minute mod-expiry
// job (see src/modules/moderation/expiry.js) — no separate scheduler.
export async function sweepExpiredLockdowns({
  client,
  lockdown,
  prisma,
  logger,
  now = new Date(),
}) {
  const due = await prisma.lockdownState.findMany({
    where: { status: "active", expiresAt: { not: null, lte: now } },
  });

  let unlocked = 0;
  for (const state of due) {
    const guild = client.guilds.cache.get(state.guildId);
    if (!guild) continue; // another shard owns it, or the bot was removed
    try {
      const res = await lockdown.unlock({ guild, actorId: "system", reason: "Lockdown expired" });
      if (res.ok) unlocked++;
    } catch (err) {
      logger?.error?.({ err, guildId: state.guildId }, "failed to auto-unlock expired lockdown");
    }
  }
  if (unlocked > 0) logger?.info?.({ count: unlocked }, "auto-unlocked expired lockdowns");
  return unlocked;
}
