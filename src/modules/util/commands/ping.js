import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { buildPingCard } from "../pingCard.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot's latency and health."),
  permissions: [],
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const currentPing = Math.round(interaction.client.ws.ping);
    ctx.pingHistory?.push(currentPing);
    const png = await buildPingCard({
      samples: ctx.pingHistory?.samples() ?? [],
      currentPing,
      uptimeMs: interaction.client.uptime ?? 0,
    });
    const file = new AttachmentBuilder(png, { name: "ping.png" });
    await interaction.editReply({ files: [file] });
  },
};
