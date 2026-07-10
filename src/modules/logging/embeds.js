import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

const NO_CONTENT = "*(content unavailable — enable the Message Content intent)*";

export function memberJoinEmbed(member) {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("📥 Member Joined")
    .setDescription(
      `<@${member.id}> (\`${member.id}\`)${member.user?.tag ? ` — ${member.user.tag}` : ""}`,
    )
    .setTimestamp();
}

export function memberLeaveEmbed(member) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle("📤 Member Left")
    .setDescription(
      `<@${member.id}> (\`${member.id}\`)${member.user?.tag ? ` — ${member.user.tag}` : ""}`,
    )
    .setTimestamp();
}

export function messageDeleteEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("🗑️ Message Deleted")
    .addFields(
      { name: "Author", value: message.author ? `<@${message.author.id}>` : "unknown", inline: true },
      { name: "Channel", value: message.channelId ? `<#${message.channelId}>` : "unknown", inline: true },
      { name: "Content", value: message.content?.slice(0, 1024) || NO_CONTENT },
    )
    .setTimestamp();
}

export function messageEditEmbed(oldMessage, newMessage) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle("✏️ Message Edited")
    .addFields(
      { name: "Author", value: newMessage.author ? `<@${newMessage.author.id}>` : "unknown", inline: true },
      { name: "Channel", value: newMessage.channelId ? `<#${newMessage.channelId}>` : "unknown", inline: true },
      { name: "Before", value: oldMessage.content?.slice(0, 1024) || NO_CONTENT },
      { name: "After", value: newMessage.content?.slice(0, 1024) || NO_CONTENT },
    )
    .setTimestamp();
}

export function roleEmbed(role, action) {
  return new EmbedBuilder()
    .setColor(action === "created" ? COLORS.success : COLORS.error)
    .setTitle(`🎭 Role ${action}`)
    .setDescription(`**${role.name}** (\`${role.id}\`)`)
    .setTimestamp();
}

export function channelEmbed(channel, action) {
  return new EmbedBuilder()
    .setColor(action === "created" ? COLORS.success : COLORS.error)
    .setTitle(`📁 Channel ${action}`)
    .setDescription(`**${channel.name}** (\`${channel.id}\`)`)
    .setTimestamp();
}

export function voiceEmbed(oldState, newState) {
  let title;
  let description;
  const userId = newState.member?.id ?? oldState.member?.id;
  if (!oldState.channelId && newState.channelId) {
    title = "🔊 Voice — joined";
    description = `<@${userId}> joined <#${newState.channelId}>`;
  } else if (oldState.channelId && !newState.channelId) {
    title = "🔇 Voice — left";
    description = `<@${userId}> left <#${oldState.channelId}>`;
  } else {
    title = "🔀 Voice — moved";
    description = `<@${userId}> moved <#${oldState.channelId}> → <#${newState.channelId}>`;
  }
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(description).setTimestamp();
}

export function serverUpdateEmbed(oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode)
    changes.push(`**Vanity:** ${oldGuild.vanityURLCode ?? "none"} → ${newGuild.vanityURLCode ?? "none"}`);
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("⚙️ Server Updated")
    .setDescription(changes.length ? changes.join("\n") : "Server settings changed.")
    .setTimestamp();
}

export function modActionEmbed(caseRow) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`🔨 Mod Action — Case #${caseRow.caseNumber} (${caseRow.type})`)
    .addFields(
      { name: "User", value: `<@${caseRow.targetId}>`, inline: true },
      { name: "Moderator", value: `<@${caseRow.moderatorId}>`, inline: true },
      { name: "Reason", value: caseRow.reason ?? "No reason provided" },
    )
    .setTimestamp();
}
