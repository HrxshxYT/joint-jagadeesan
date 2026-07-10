import { EventEmitter } from "node:events";

export class CaseService extends EventEmitter {
  constructor(prisma) {
    super();
    this.prisma = prisma;
  }

  async createCase({
    guildId,
    type,
    targetId,
    moderatorId,
    reason = "No reason provided",
    expiresAt = null,
  }) {
    const record = await this.prisma.$transaction(async (tx) => {
      const last = await tx.case.findFirst({
        where: { guildId },
        orderBy: { caseNumber: "desc" },
        select: { caseNumber: true },
      });
      const caseNumber = (last?.caseNumber ?? 0) + 1;
      return tx.case.create({
        data: { guildId, caseNumber, type, targetId, moderatorId, reason, expiresAt },
      });
    });
    this.emit("caseCreated", record);
    return record;
  }

  async getCase(guildId, caseNumber) {
    return this.prisma.case.findUnique({ where: { guildId_caseNumber: { guildId, caseNumber } } });
  }

  async listCases(guildId, targetId) {
    return this.prisma.case.findMany({
      where: { guildId, targetId },
      orderBy: { caseNumber: "asc" },
    });
  }

  async updateReason(guildId, caseNumber, reason) {
    return this.prisma.case.update({
      where: { guildId_caseNumber: { guildId, caseNumber } },
      data: { reason },
    });
  }

  async deleteCase(guildId, caseNumber) {
    return this.prisma.case.delete({ where: { guildId_caseNumber: { guildId, caseNumber } } });
  }

  async dueExpired(now = new Date()) {
    return this.prisma.case.findMany({
      where: { active: true, type: "tempban", expiresAt: { not: null, lte: now } },
    });
  }

  async deactivate(id) {
    return this.prisma.case.update({ where: { id }, data: { active: false } });
  }
}
