export async function handleClaim(interaction, ctx, ticket) {
  const caller = interaction.user.id;
  const unclaiming = ticket.claimedById === caller;
  const next = unclaiming ? null : caller;
  await ctx.tickets.setClaim(ticket.id, next);
  await interaction.update({ components: interaction.message.components }).catch(() => {});
  await interaction.channel.send(
    unclaiming ? `Ticket released by <@${caller}>.` : `Ticket claimed by <@${caller}>.`,
  ).catch(() => {});
}
