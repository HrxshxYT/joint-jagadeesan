import { SlashCommandBuilder } from "discord.js";
import { getActivePlayer, musicNotice } from "../commandKit.js";

const BASSBOOST_EQ = [
  { band: 0, gain: 0.3 },
  { band: 1, gain: 0.25 },
  { band: 2, gain: 0.2 },
  { band: 3, gain: 0.1 },
];

// Applies a named audio filter via Lavalink's FilterManager. Each choice resets
// prior filters first so switching is clean.
async function applyFilter(player, name) {
  const fm = player.filterManager;
  await fm.resetFilters();
  if (name === "bassboost") await fm.setEQ(BASSBOOST_EQ);
  else if (name === "nightcore") await fm.toggleNightcore();
  else if (name === "8d") await fm.toggleRotation();
}

export default {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply an audio filter.")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Which filter")
        .setRequired(true)
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Bass Boost", value: "bassboost" },
          { name: "Nightcore", value: "nightcore" },
          { name: "8D", value: "8d" },
        ),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const player = await getActivePlayer(interaction, ctx);
    if (!player) return;
    const name = interaction.options.getString("name");
    await applyFilter(player, name);
    player.set("filter", name);
    await interaction.reply(musicNotice(name === "off" ? "🎛️ Filters cleared." : `🎛️ Applied the **${name}** filter.`));
  },
};

export { applyFilter };
