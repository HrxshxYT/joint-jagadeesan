import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency."),
  permissions: [],
  async execute(interaction, _ctx) {
    const ws = Math.round(interaction.client.ws.ping);
    await interaction.reply({ embeds: [infoEmbed("🏓 Pong!", `WebSocket latency: **${ws}ms**`)] });
  },
};
