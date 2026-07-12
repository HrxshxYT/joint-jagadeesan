import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runWelcomePanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Open the welcome & goodbye control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runWelcomePanel(interaction, ctx),
};
