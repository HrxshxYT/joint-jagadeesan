import { pageRow, toggleRow } from "./components.js";
import { awaitButton, disableAll } from "./collect.js";

export async function runPager({
  interaction,
  count,
  render,
  ownerId,
  awaitFn = awaitButton,
  timeMs = 150000,
}) {
  let page = 0;
  const payload = () => ({
    embeds: [render(page)],
    components: count > 1 ? [pageRow({ page, pageCount: count, ownerId })] : [],
  });
  await interaction.reply(payload());
  if (count <= 1) return;
  const message = await interaction.fetchReply();
  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;
    if (i.customId === `page:prev:${ownerId}`) page = Math.max(0, page - 1);
    else if (i.customId === `page:next:${ownerId}`) page = Math.min(count - 1, page + 1);
    await i.update(payload());
  }
  await interaction
    .editReply({ components: disableAll([pageRow({ page, pageCount: count, ownerId })]) })
    .catch(() => {});
}

export async function runToggler({
  interaction,
  buildItems,
  onToggle,
  renderEmbed,
  ownerId,
  awaitFn = awaitButton,
  timeMs = 150000,
}) {
  const payload = () => ({ embeds: [renderEmbed()], components: toggleRow(buildItems(), ownerId) });
  await interaction.reply(payload());
  const message = await interaction.fetchReply();
  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;
    const parts = i.customId.split(":");
    if (parts[0] === "toggle") await onToggle(parts[1]);
    await i.update(payload());
  }
  await interaction
    .editReply({ components: disableAll(toggleRow(buildItems(), ownerId)) })
    .catch(() => {});
}
