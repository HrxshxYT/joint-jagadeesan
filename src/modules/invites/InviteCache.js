export function findUsedInvite(cachedMap, fresh) {
  for (const inv of fresh) {
    const prev = cachedMap.get(inv.code) ?? 0;
    if (inv.uses > prev) return { code: inv.code, inviterId: inv.inviterId };
  }
  return null;
}

export class InviteCache {
  constructor() {
    this.guilds = new Map(); // guildId -> Map<code, uses>
  }

  getGuild(guildId) {
    return this.guilds.get(guildId) ?? new Map();
  }

  setGuild(guildId, fresh) {
    this.guilds.set(guildId, new Map(fresh.map((i) => [i.code, i.uses])));
  }

  update(guildId, code, uses) {
    const map = this.guilds.get(guildId) ?? new Map();
    map.set(code, uses);
    this.guilds.set(guildId, map);
  }

  remove(guildId, code) {
    this.guilds.get(guildId)?.delete(code);
  }
}
