const INCLUDE = { antinuke: true, logging: true, modRoles: true, whitelist: true };

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

  async updateAntinuke(guildId, data) {
    await this.getGuild(guildId); // ensure the parent guild row exists
    const row = await this.prisma.antinukeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addWhitelist(guildId, targetId, type, addedById) {
    await this.getGuild(guildId);
    const row = await this.prisma.whitelist.upsert({
      where: { guildId_targetId: { guildId, targetId } },
      create: { guildId, targetId, type, addedById },
      update: { type },
    });
    this.invalidate(guildId);
    return row;
  }

  async removeWhitelist(guildId, targetId) {
    await this.prisma.whitelist.deleteMany({ where: { guildId, targetId } });
    this.invalidate(guildId);
  }

  invalidate(guildId) {
    this.cache.delete(guildId);
  }
}
