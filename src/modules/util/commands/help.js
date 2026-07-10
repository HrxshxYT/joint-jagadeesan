import { SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../../../lib/embeds.js";
import { buildHelpOverviewEmbed, buildHelpDetailEmbed } from "../help.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List commands or get help for a specific command.")
    .addStringOption((o) =>
      o.setName("command").setDescription("A command to get details on").setAutocomplete(true),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const name = interaction.options.getString("command");
    if (!name) {
      await interaction.reply({ embeds: [buildHelpOverviewEmbed(ctx.commands)] });
      return;
    }
    const command = ctx.commands.get(name);
    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed(`No command named \`${name}\`.`)],
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({ embeds: [buildHelpDetailEmbed(command)] });
  },
  async autocomplete(interaction, ctx) {
    const focused = (interaction.options.getFocused() ?? "").toLowerCase();
    const choices = [...ctx.commands.keys()]
      .filter((n) => n.toLowerCase().startsWith(focused))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(choices);
  },
};
