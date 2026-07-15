// src/modules/tickets/commands/tickets.js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { runTicketsPanel } from "../panel/index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Open the ticket-system control panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  permissions: [PermissionFlagsBits.Administrator],
  execute: (interaction, ctx) => runTicketsPanel(interaction, ctx),
};
