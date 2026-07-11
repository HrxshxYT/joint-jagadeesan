import { runPanel } from "../../../lib/panel.js";
import { buildMainView, buildWhitelistView } from "./render.js";
import { handleAntinukeComponent } from "./handlers.js";

export async function runAntinukePanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    guild: interaction.guild,
    ownerId: interaction.user.id,
    view: "main",
    antinuke: { ...(gc.antinuke ?? {}) },
    whitelist: [...(gc.whitelist ?? [])],
  };
  const render = () => (state.view === "whitelist" ? buildWhitelistView(state) : buildMainView(state));

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleAntinukeComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
