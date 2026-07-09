const INCLUDE = { antinuke: true, logging: true, modRoles: true };

export class ConfigService {
  constructor(prisma) {
    this.prisma = prisma;
    this.cache = new Map();
  }

  async getGuild(guildId) {
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId);
    }
    let row = await this.prisma.guild.findUnique({ where: { id: guildId }, include: INCLUDE });
    if (!row) {
      row = await this.prisma.guild.create({ data: { id: guildId }, include: INCLUDE });
    }
    this.cache.set(guildId, row);
    return row;
  }

  async updateGuild(guildId, data) {
    const row = await this.prisma.guild.update({
      where: { id: guildId },
      data,
      include: INCLUDE,
    });
    this.cache.set(guildId, row);
    return row;
  }

  invalidate(guildId) {
    this.cache.delete(guildId);
  }
}
