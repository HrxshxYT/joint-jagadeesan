import { Events } from "discord.js";

export default {
  name: Events.InviteDelete,
  async execute(ctx, invite) {
    if (!invite.guild) return;
    ctx.inviteCache.remove(invite.guild.id, invite.code);
  },
};
