export class ReactionRoleService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async add({ guildId, channelId, messageId, emoji, roleId }) {
    return this.prisma.reactionRole.upsert({
      where: { guildId_messageId_emoji: { guildId, messageId, emoji } },
      create: { guildId, channelId, messageId, emoji, roleId },
      update: { roleId, channelId },
    });
  }

  async remove(guildId, messageId, emoji) {
    await this.prisma.reactionRole.deleteMany({ where: { guildId, messageId, emoji } });
  }

  async find(guildId, messageId, emoji) {
    return this.prisma.reactionRole.findUnique({
      where: { guildId_messageId_emoji: { guildId, messageId, emoji } },
    });
  }

  async listForGuild(guildId) {
    return this.prisma.reactionRole.findMany({ where: { guildId } });
  }
}
