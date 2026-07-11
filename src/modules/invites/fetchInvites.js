export async function fetchInvitesFor(guild) {
  try {
    const invites = await guild.invites.fetch();
    return [...invites.values()].map((i) => ({
      code: i.code,
      uses: i.uses ?? 0,
      inviterId: i.inviter?.id ?? null,
    }));
  } catch {
    return []; // missing Manage Server permission, etc.
  }
}
