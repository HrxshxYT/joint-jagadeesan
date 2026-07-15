// src/modules/tickets/panel/index.js
import { runPanel } from "../../../lib/panel.js";
import { buildTicketsView } from "./render.js";
import { handleTicketsComponent } from "./handlers.js";

export async function runTicketsPanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const [config, panels] = await Promise.all([
    ctx.tickets.getConfig(guildId),
    ctx.tickets.listPanels(guildId),
  ]);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    view: "home",
    config,
    panels,
    selectedPanelId: null,
    selectedCategoryId: null,
  };
  const render = () => buildTicketsView(state);
  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleTicketsComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
