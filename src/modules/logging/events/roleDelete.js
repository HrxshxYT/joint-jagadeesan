import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { roleEmbed } from "../embeds.js";

export default {
  name: Events.GuildRoleDelete,
  async execute(ctx, role) {
    await logEvent(ctx, role.guild, "roleChanges", roleEmbed(role, "deleted"));
  },
};
