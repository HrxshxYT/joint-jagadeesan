import { findUsedInvite } from "./InviteCache.js";

export async function processInviteJoin({ member, inviteCache, service, fetchInvites, logger }) {
  const guildId = member.guild.id;
  try {
    const fresh = await fetchInvites(member.guild);
    const cached = inviteCache.getGuild(guildId);
    const used = findUsedInvite(cached, fresh);
    inviteCache.setGuild(guildId, fresh);
    await service.recordJoin({
      guildId,
      memberId: member.id,
      inviterId: used?.inviterId ?? null,
      code: used?.code ?? null,
    });
    return used;
  } catch (err) {
    logger.error({ err }, "invite join processing failed");
    return null;
  }
}
