import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { infoEmbed } from "../../../lib/embeds.js";
import { renderTemplate } from "../render.js";

async function openMessageModal(i, state, ctx, render, which) {
  const field = which === "welcome" ? "welcomeMessage" : "goodbyeMessage";
  const modalId = `we:msgmodal:${which}:${i.user.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(`${which === "welcome" ? "Welcome" : "Goodbye"} message`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("text")
        .setLabel("Template — supports placeholders")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(String(state.welcome[field] ?? ""))
        .setRequired(true)
        .setMaxLength(1000),
    ),
  );
  await i.showModal(modal);

  let sub;
  try {
    sub = await i.awaitModalSubmit({ time: 120000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
  } catch {
    return "handled";
  }

  const text = sub.fields.getTextInputValue("text");
  await ctx.config.updateWelcome(state.guildId, { [field]: text });
  state.welcome[field] = text;
  await sub.update(render());
  return "handled";
}

export async function handleWelcomeComponent(i, state, ctx, render) {
  const parts = i.customId.split(":"); // we:<kind>:<arg>:<owner>
  const kind = parts[1];
  const arg = parts[2];

  if (kind === "close") return "close";

  if (kind === "tog") {
    const next = !state.welcome[arg];
    await ctx.config.updateWelcome(state.guildId, { [arg]: next });
    state.welcome[arg] = next;
    return "update";
  }

  if (kind === "ch") {
    const channelId = i.values[0];
    const chField = arg === "welcome" ? "welcomeChannelId" : "goodbyeChannelId";
    const enField = arg === "welcome" ? "welcomeEnabled" : "goodbyeEnabled";
    await ctx.config.updateWelcome(state.guildId, { [chField]: channelId, [enField]: true });
    state.welcome[chField] = channelId;
    state.welcome[enField] = true;
    return "update";
  }

  if (kind === "msg") {
    return openMessageModal(i, state, ctx, render, arg);
  }

  if (kind === "preview") {
    const opts = { member: i.member, guild: i.guild };
    const welcome = renderTemplate(state.welcome.welcomeMessage, opts);
    const goodbye = renderTemplate(state.welcome.goodbyeMessage, opts);
    await i.reply({
      embeds: [infoEmbed("👋 Preview", `**Welcome:**\n${welcome}\n\n**Goodbye:**\n${goodbye}`)],
      ephemeral: true,
    });
    return "handled";
  }

  return "update";
}
