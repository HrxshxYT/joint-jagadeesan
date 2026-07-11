import { renderTemplate } from "./render.js";

const DEFAULT_WELCOME = "Welcome {mention} to **{server}**! You are member #{memberCount}.";
const DEFAULT_GOODBYE = "**{user}** has left the server.";

export async function processMemberJoin({ member, guildConfig, deps, logger }) {
  try {
    const roleIds = (guildConfig.autoRoles ?? []).map((r) => r.roleId);
    if (roleIds.length) await deps.assignRoles(member, roleIds);

    const w = guildConfig.welcome;
    if (w?.welcomeEnabled && w.welcomeChannelId) {
      const text = renderTemplate(w.welcomeMessage || DEFAULT_WELCOME, {
        member,
        guild: member.guild,
      });
      await deps.sendMessage(member.guild, w.welcomeChannelId, text);
    }
  } catch (err) {
    logger.error({ err, guildId: member.guild?.id }, "welcome join processing failed");
  }
}

export async function processMemberLeave({ member, guildConfig, deps, logger }) {
  try {
    const w = guildConfig.welcome;
    if (w?.goodbyeEnabled && w.goodbyeChannelId) {
      const text = renderTemplate(w.goodbyeMessage || DEFAULT_GOODBYE, {
        member,
        guild: member.guild,
      });
      await deps.sendMessage(member.guild, w.goodbyeChannelId, text);
    }
  } catch (err) {
    logger.error({ err, guildId: member.guild?.id }, "welcome leave processing failed");
  }
}
