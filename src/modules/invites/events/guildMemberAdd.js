import { Events } from "discord.js";
import { processInviteJoin } from "../join.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    await processInviteJoin({
      member,
      inviteCache: ctx.inviteCache,
      service: ctx.invites,
      fetchInvites: fetchInvitesFor,
      logger: ctx.logger,
    });
  },
};
