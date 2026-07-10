import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildCaseEmbed } from "../helpers.js";
import { errorEmbed, successEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View or edit a moderation case.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View a case")
        .addIntegerOption((o) =>
          o.setName("number").setDescription("Case number").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reason")
        .setDescription("Edit a case reason")
        .addIntegerOption((o) =>
          o.setName("number").setDescription("Case number").setRequired(true),
        )
        .addStringOption((o) => o.setName("text").setDescription("New reason").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Delete a case")
        .addIntegerOption((o) =>
          o.setName("number").setDescription("Case number").setRequired(true),
        ),
    ),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger("number");
    const guildId = interaction.guildId;

    if (sub === "view") {
      const record = await ctx.cases.getCase(guildId, number);
      if (!record) {
        await interaction.reply({
          embeds: [errorEmbed(`Case #${number} not found.`)],
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({ embeds: [buildCaseEmbed(record)] });
      return;
    }
    if (sub === "reason") {
      const text = interaction.options.getString("text");
      try {
        const updated = await ctx.cases.updateReason(guildId, number, text);
        await interaction.reply({ embeds: [buildCaseEmbed(updated)] });
      } catch {
        await interaction.reply({
          embeds: [errorEmbed(`Case #${number} not found.`)],
          ephemeral: true,
        });
      }
      return;
    }
    if (sub === "delete") {
      try {
        await ctx.cases.deleteCase(guildId, number);
        await interaction.reply({ embeds: [successEmbed(`Case #${number} deleted.`)] });
      } catch {
        await interaction.reply({
          embeds: [errorEmbed(`Case #${number} not found.`)],
          ephemeral: true,
        });
      }
    }
  },
};
