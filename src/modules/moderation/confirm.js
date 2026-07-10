import { confirmRow } from "../../lib/components.js";
import { awaitButton, disableAll } from "../../lib/collect.js";
import { errorEmbed } from "../../lib/embeds.js";

/**
 * Show a summary embed with Confirm/Cancel buttons. On confirm, run onConfirm()
 * (which returns the result embed) and show it; on cancel/timeout, show "Cancelled".
 * Owner-gated to the invoking user, 30s default.
 */
export async function withConfirm({ interaction, summaryEmbed, onConfirm, awaitFn = awaitButton, timeMs = 30000 }) {
  const ownerId = interaction.user.id;
  await interaction.reply({ embeds: [summaryEmbed], components: [confirmRow(ownerId)] });
  const message = await interaction.fetchReply();
  const click = await awaitFn({ message, ownerId, timeMs });

  if (!click || click.customId === `confirm:no:${ownerId}`) {
    const embed = errorEmbed("Cancelled — no action taken.");
    const components = disableAll([confirmRow(ownerId)]);
    if (click) await click.update({ embeds: [embed], components });
    else await interaction.editReply({ embeds: [embed], components }).catch(() => {});
    return;
  }

  const result = await onConfirm();
  await click.update({ embeds: [result], components: disableAll([confirmRow(ownerId)]) });
}
