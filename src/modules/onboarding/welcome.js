import { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import { COLORS, BOT_NAME, EMOJIS, LINKS } from "../../lib/constants.js";
import { buildWelcomeCard, WELCOME_FILENAME } from "./card.js";

// Channel names we actively prefer to post the welcome message into, best first.
const PREFERRED_NAMES = ["bot-commands", "bot-cmds", "commands", "general"];

// Can the bot actually talk here? A text channel we can't send to is useless.
function canSend(channel, botId) {
  if (!channel?.isTextBased?.()) return false;
  const perms = channel.permissionsFor?.(botId);
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.SendMessages);
}

// Pick the friendliest channel to greet a new server in:
//   1. a channel named like commands/general (in PREFERRED_NAMES order),
//   2. otherwise the guild's system channel,
//   3. otherwise the first text channel we're allowed to speak in.
// Only channels the bot can send to are eligible. Returns the channel or null.
export function findWelcomeChannel(guild, botId) {
  const cache = guild?.channels?.cache;
  const channels = typeof cache?.values === "function" ? [...cache.values()] : [];
  const sendable = channels.filter((c) => canSend(c, botId));

  for (const wanted of PREFERRED_NAMES) {
    const hit = sendable.find((c) => c.name?.toLowerCase() === wanted);
    if (hit) return hit;
  }

  const system = sendable.find((c) => c.id === guild?.systemChannelId);
  if (system) return system;

  return sendable[0] ?? null;
}

// The setup instructions, shared by both the DM and the in-server embed so the
// two never drift apart.
function setupFields() {
  return [
    {
      name: `${EMOJIS.book} Quick start`,
      value: [
        "**`/scan`** — audit your server's security posture and get tailored fixes.",
        `**\`/antinuke\`** — open the protection panel and switch on Anti-Nuke ${EMOJIS.shield} **and** Anti-Raid.`,
        "**`/dashboard`** — pin a live dashboard of your server's protection analytics.",
      ].join("\n"),
    },
    {
      name: "🔗 Links",
      value: [
        `[Support Server](${LINKS.support})`,
        `[Community Server](${LINKS.ownerServer})`,
        `[Uptime & Status](${LINKS.uptime})`,
      ].join(" • "),
    },
  ];
}

function baseEmbed(guildName, { imageName } = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`${EMOJIS.wave} Thanks for adding ${BOT_NAME}!`)
    .setDescription(
      `${BOT_NAME} is now guarding **${guildName}**. Here's how to lock things down in under a minute:`,
    )
    .addFields(setupFields())
    .setFooter({ text: BOT_NAME })
    .setTimestamp();
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

// Embed posted publicly in the new server's welcome channel.
export function buildWelcomeEmbed(guild, opts = {}) {
  const embed = baseEmbed(guild?.name ?? "your server", opts);
  const icon = guild?.iconURL?.({ extension: "png", size: 128 });
  if (icon) embed.setThumbnail(icon);
  return embed;
}

// Embed DM'd to the server owner. Same steps, addressed personally with a
// mention of whoever added the bot.
export function buildOwnerDmEmbed(guild, owner, opts = {}) {
  const who = owner?.id ? `<@${owner.id}>` : "there";
  return baseEmbed(guild?.name ?? "your server", opts).setDescription(
    `Thanks for adding me, ${who}! **${BOT_NAME}** is now guarding **${guild?.name ?? "your server"}**. ` +
      "Run these three commands to get protected right away:",
  );
}

// Fire-and-forget onboarding: DM the owner and greet the server. Neither leg
// may throw — a closed-DM owner or a permission-less server must not crash the
// guildCreate handler.
export async function sendOnboarding({ client, logger }, guild) {
  const botId = client?.user?.id;

  // Render the liquid-glass banner once and reuse it across both messages.
  // A render failure just drops the image — the text embeds still go out.
  let card = null;
  try {
    card = buildWelcomeCard();
  } catch (err) {
    logger?.warn?.({ err, guildId: guild?.id }, "onboarding: card render failed");
  }
  const imageName = card ? WELCOME_FILENAME : undefined;
  // A Buffer attachment can't be shared across two sends, so mint one per send.
  const attach = () => (card ? [new AttachmentBuilder(card, { name: WELCOME_FILENAME })] : []);

  // 1. DM the server owner.
  try {
    const owner = await guild.fetchOwner();
    await owner.send({ embeds: [buildOwnerDmEmbed(guild, owner, { imageName })], files: attach() });
  } catch (err) {
    logger?.info?.({ err, guildId: guild?.id }, "onboarding: could not DM owner");
  }

  // 2. Greet the server in the best available channel.
  try {
    const channel = findWelcomeChannel(guild, botId);
    if (channel) {
      await channel.send({ embeds: [buildWelcomeEmbed(guild, { imageName })], files: attach() });
    } else {
      logger?.info?.({ guildId: guild?.id }, "onboarding: no sendable welcome channel");
    }
  } catch (err) {
    logger?.warn?.({ err, guildId: guild?.id }, "onboarding: welcome message send failed");
  }
}
