import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed, infoEmbed } from "../../../lib/embeds.js";
import { parseEmoji } from "../render.js";

export default {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Self-assignable roles via message reactions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription(
          "Bind an emoji reaction on a message to a role (run in the message's channel).",
        )
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Target message ID").setRequired(true),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a reaction-role binding.")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Target message ID").setRequired(true),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List reaction-role bindings.")),
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const messageId = interaction.options.getString("message_id");
      const role = interaction.options.getRole("role");
      const { react, key } = parseEmoji(interaction.options.getString("emoji"));
      const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        await interaction.reply({
          embeds: [
            errorEmbed("Message not found in this channel. Run the command where the message is."),
          ],
          ephemeral: true,
        });
        return;
      }
      await message.react(react).catch(() => {});
      await ctx.reactionRoles.add({
        guildId,
        channelId: interaction.channelId,
        messageId,
        emoji: key,
        roleId: role.id,
      });
      await interaction.reply({
        embeds: [
          successEmbed(`Reacting with that emoji on the message now grants <@&${role.id}>.`),
        ],
      });
      return;
    }

    if (sub === "remove") {
      const messageId = interaction.options.getString("message_id");
      const { key } = parseEmoji(interaction.options.getString("emoji"));
      await ctx.reactionRoles.remove(guildId, messageId, key);
      await interaction.reply({ embeds: [successEmbed("Reaction-role binding removed.")] });
      return;
    }

    if (sub === "list") {
      const rows = await ctx.reactionRoles.listForGuild(guildId);
      const body =
        rows.length === 0
          ? "_No reaction roles set._"
          : rows
              .map((r) => {
                const emoji = /^\d+$/.test(r.emoji) ? `<:rr:${r.emoji}>` : r.emoji;
                return `${emoji} → <@&${r.roleId}> (msg \`${r.messageId}\`)`;
              })
              .join("\n");
      await interaction.reply({ embeds: [infoEmbed("Reaction roles", body)] });
    }
  },
};
