import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { canActOn } from "../../lib/hierarchy.js";

const HIERARCHY_MESSAGES = {
  target_is_owner: "You can't moderate the server owner.",
  actor_not_higher: "You can't moderate someone whose highest role is above or equal to yours.",
  bot_not_higher: "My highest role isn't above that member — move my role up to moderate them.",
};

export function checkHierarchy({ actorMember, targetMember, botMember }) {
  const res = canActOn({ actor: actorMember, target: targetMember, botMember });
  if (res.ok) return { ok: true };
  return { ok: false, message: HIERARCHY_MESSAGES[res.reason] ?? "You can't moderate that member." };
}

export async function dmTarget(user, embed, logger) {
  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch (err) {
    logger?.debug?.({ err }, "could not DM target");
    return false;
  }
}

const TYPE_COLORS = {
  ban: COLORS.error,
  tempban: COLORS.error,
  softban: COLORS.error,
  kick: COLORS.warn,
  timeout: COLORS.warn,
  warn: COLORS.warn,
  unban: COLORS.success,
  untimeout: COLORS.success,
};

export function buildCaseEmbed(caseRow) {
  return new EmbedBuilder()
    .setColor(TYPE_COLORS[caseRow.type] ?? COLORS.info)
    .setTitle(`Case #${caseRow.caseNumber} — ${caseRow.type}`)
    .addFields(
      { name: "User", value: `<@${caseRow.targetId}> (\`${caseRow.targetId}\`)`, inline: true },
      { name: "Moderator", value: `<@${caseRow.moderatorId}>`, inline: true },
      { name: "Reason", value: caseRow.reason ?? "No reason provided" },
    )
    .setTimestamp(caseRow.createdAt ? new Date(caseRow.createdAt) : new Date());
}
