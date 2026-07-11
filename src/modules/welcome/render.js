export function renderTemplate(template, { member, guild }) {
  return String(template ?? "")
    .replaceAll("{mention}", `<@${member.id}>`)
    .replaceAll("{user}", member.user?.tag ?? member.id)
    .replaceAll("{username}", member.user?.username ?? "member")
    .replaceAll("{server}", guild.name ?? "the server")
    .replaceAll("{memberCount}", String(guild.memberCount ?? 0));
}

const CUSTOM_EMOJI = /^<a?:\w+:(\d+)>$/;

export function parseEmoji(input) {
  const m = input.match(CUSTOM_EMOJI);
  if (m) return { react: m[1], key: m[1] };
  return { react: input, key: input };
}
