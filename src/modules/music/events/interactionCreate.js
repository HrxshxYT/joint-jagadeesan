import { Events } from "discord.js";
import { handleControl } from "../controls.js";

// Persistent router for the Now-Playing buttons (long-lived messages, so no
// per-message collector). Mirrors the tickets router pattern.
export default {
  name: Events.InteractionCreate,
  async execute(ctx, interaction) {
    if (!interaction.isButton?.()) return;
    if (typeof interaction.customId !== "string" || !interaction.customId.startsWith("music:")) return;
    await handleControl(interaction, ctx);
  },
};
