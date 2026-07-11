export class InviteService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async recordJoin({ guildId, memberId, inviterId, code }) {
    return this.prisma.memberInvite.upsert({
      where: { guildId_memberId: { guildId, memberId } },
      create: { guildId, memberId, inviterId, code, left: false },
      update: { inviterId, code, left: false, joinedAt: new Date() },
    });
  }

  async markLeft(guildId, memberId) {
    const rec = await this.prisma.memberInvite.findUnique({
      where: { guildId_memberId: { guildId, memberId } },
    });
    if (!rec) return null;
    await this.prisma.memberInvite.update({
      where: { guildId_memberId: { guildId, memberId } },
      data: { left: true },
    });
    return rec;
  }

  async getStats(guildId, userId) {
    const regular = await this.prisma.memberInvite.count({
      where: { guildId, inviterId: userId, left: false },
    });
    const left = await this.prisma.memberInvite.count({
      where: { guildId, inviterId: userId, left: true },
    });
    const bonusRow = await this.prisma.inviteBonus.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    const bonus = bonusRow?.amount ?? 0;
    return { regular, left, bonus, total: regular + bonus - left };
  }

  async addBonus(guildId, userId, amount) {
    return this.prisma.inviteBonus.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, amount },
      update: { amount: { increment: amount } },
    });
  }

  async reset(guildId, userId) {
    await this.prisma.memberInvite.deleteMany({ where: { guildId, inviterId: userId } });
    await this.prisma.inviteBonus.deleteMany({ where: { guildId, userId } });
  }

  async leaderboard(guildId, limit = 10) {
    const grouped = await this.prisma.memberInvite.groupBy({
      by: ["inviterId"],
      where: { guildId, left: false, inviterId: { not: null } },
      _count: { inviterId: true },
    });
    return grouped
      .map((g) => ({ userId: g.inviterId, count: g._count.inviterId }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
