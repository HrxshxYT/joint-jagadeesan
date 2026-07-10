import { Events } from "discord.js";

export default {
  name: Events.InviteCreate,
  async execute(ctx, invite) {
    if (!invite.guild) return;
    ctx.inviteCache.update(invite.guild.id, invite.code, invite.uses ?? 0);
  },
};
