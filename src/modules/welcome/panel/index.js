import { runPanel } from "../../../lib/panel.js";
import { buildWelcomeView } from "./render.js";
import { handleWelcomeComponent } from "./handlers.js";

const DEFAULTS = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: "Welcome {mention} to **{server}**! You are member #{memberCount}.",
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: "**{user}** has left the server.",
};

export async function runWelcomePanel(interaction, ctx) {
  const guildId = interaction.guildId;
  const gc = await ctx.config.getGuild(guildId);
  const state = {
    guildId,
    ownerId: interaction.user.id,
    welcome: { ...DEFAULTS, ...(gc.welcome ?? {}) },
  };
  const render = () => buildWelcomeView(state);

  await runPanel({
    interaction,
    ownerId: state.ownerId,
    render,
    handle: (i, r) => handleWelcomeComponent(i, state, ctx, r),
    awaitFn: ctx.awaitFn,
  });
}
