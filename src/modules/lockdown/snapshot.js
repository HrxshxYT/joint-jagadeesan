import { PermissionsBitField } from "discord.js";

// Three prior states of a permission field, encoded as two booleans:
//   allow   -> (true, false)
//   deny    -> (false, true)
//   neutral -> (false, false)   <- the state naive lockdowns destroy
export function decodeState({ priorAllow, priorDeny }) {
  if (priorAllow) return true;
  if (priorDeny) return false;
  return null;
}

// Read the current tri-state of `field` on a channel overwrite for `holderId`.
export function readOverwrite(channel, holderId, field) {
  const ow = channel.permissionOverwrites.cache.get(holderId);
  if (!ow) return { priorAllow: false, priorDeny: false };
  return {
    priorAllow: ow.allow.has(PermissionsBitField.Flags[field]),
    priorDeny: ow.deny.has(PermissionsBitField.Flags[field]),
  };
}

export function snapshotChannelField(channel, holderId, field) {
  const { priorAllow, priorDeny } = readOverwrite(channel, holderId, field);
  return {
    targetType: "channel",
    channelId: channel.id,
    targetId: holderId,
    field,
    priorAllow,
    priorDeny,
    addedByUs: false,
  };
}

export function snapshotRolePerm(role, field) {
  return {
    targetType: "role",
    channelId: null,
    targetId: role.id,
    field,
    priorAllow: role.permissions.has(PermissionsBitField.Flags[field]),
    priorDeny: false,
    addedByUs: false,
  };
}

// Restore one snapshot row to its exact prior state. Channel overwrite rows are
// restored field-by-field (true/false/null); role-permission rows (panic) flip
// the guild-level bit back.
export async function restoreRow(guild, row, reason) {
  if (row.targetType === "role") {
    const role = guild.roles.cache.get(row.targetId) ?? guild.roles.everyone;
    const flag = PermissionsBitField.Flags[row.field];
    const next = row.priorAllow ? role.permissions.add(flag) : role.permissions.remove(flag);
    await role.setPermissions(next, reason);
    return;
  }
  const channel = guild.channels.cache.get(row.channelId);
  if (!channel) throw new Error(`channel ${row.channelId} not found`);
  await channel.permissionOverwrites.edit(
    row.targetId,
    { [row.field]: decodeState(row) },
    { reason },
  );
}
