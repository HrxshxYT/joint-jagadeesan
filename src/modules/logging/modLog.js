import { dispatchLog } from "./dispatcher.js";
import { modActionEmbed } from "./embeds.js";

export async function handleCaseCreated(context, record) {
  const guild = context.client.guilds.cache.get(record.guildId);
  if (!guild) return false;
  const guildConfig = await context.config.getGuild(record.guildId);
  return dispatchLog({
    guild,
    loggingConfig: guildConfig.logging,
    category: "modActions",
    embed: modActionEmbed(record),
    logger: context.logger,
  });
}

export function registerModLogListener(context) {
  context.cases.on("caseCreated", (record) => {
    handleCaseCreated(context, record).catch((err) =>
      context.logger.error({ err }, "mod-action log failed"),
    );
  });
}
