import { sweepExpiredLockdowns } from "../lockdown/sweep.js";

export async function sweepExpired({ client, caseService, logger, now = new Date() }) {
  const due = await caseService.dueExpired(now);
  for (const record of due) {
    try {
      const guild = client.guilds.cache.get(record.guildId);
      if (guild) {
        await guild.bans.remove(record.targetId, "Temp ban expired").catch(() => {});
      }
      await caseService.deactivate(record.id);
    } catch (err) {
      logger.error({ err, caseId: record.id }, "failed to lift expired temp ban");
    }
  }
  if (due.length > 0) logger.info?.({ count: due.length }, "processed expired temp bans");
  return due.length;
}

export function registerExpiryJob(context) {
  context.scheduler.every("* * * * *", "mod-expiry", async () => {
    await sweepExpired({
      client: context.client,
      caseService: context.cases,
      logger: context.logger,
    });
    if (context.lockdown) {
      await sweepExpiredLockdowns({
        client: context.client,
        lockdown: context.lockdown,
        prisma: context.prisma,
        logger: context.logger,
      });
    }
  });
}
