export function isAboveOrEqual(a, b) {
  return a.roles.highest.position >= b.roles.highest.position;
}

export function canActOn({ actor, target, botMember }) {
  if (target.id === target.guild.ownerId) {
    return { ok: false, reason: "target_is_owner" };
  }
  if (!isAbove(actor, target)) {
    return { ok: false, reason: "actor_not_higher" };
  }
  if (!isAbove(botMember, target)) {
    return { ok: false, reason: "bot_not_higher" };
  }
  return { ok: true };
}

function isAbove(a, b) {
  return a.roles.highest.position > b.roles.highest.position;
}
