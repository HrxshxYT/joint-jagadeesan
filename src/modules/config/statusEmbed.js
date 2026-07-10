import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildConfigEmbed(guildConfig) {
  const modRoles = guildConfig.modRoles ?? [];
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("⚙️ Server Configuration")
    .addFields(
      { name: "DM on action", value: guildConfig.dmOnAction ? "on" : "off", inline: true },
      {
        name: "Mute role",
        value: guildConfig.muteRoleId ? `<@&${guildConfig.muteRoleId}>` : "none",
        inline: true,
      },
      {
        name: `Mod roles (${modRoles.length})`,
        value: modRoles.length ? modRoles.map((r) => `<@&${r.roleId}>`).join(", ") : "none",
      },
    );
}
