import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { COLORS, EMOJIS } from "../../../lib/constants.js";

// Every native rule, in display order: [config column, label, one-line blurb].
// The multi-select uses these as its options; the embed lists their state.
const RULES = [
  ["nativeInvites", "Invite links", "Blocks Discord invite URLs"],
  ["nativeScamLinks", "Scam & phishing links", "Fake Nitro / Steam-gift domains"],
  ["nativeGrabbers", "IP loggers & grabbers", "grabify, iplogger & token grabbers"],
  ["nativeNitroScams", "Free-Nitro & gift scams", "\"free nitro\" / gift-scam text"],
  ["nativeCryptoScams", "Crypto & airdrop scams", "Airdrop / wallet-drainer text"],
  ["nativeAdSpam", "Selling & boosting spam", "Cheap-boost / account-selling ads"],
  ["nativeMentions", "Mention spam", "Mass @mentions & raid protection"],
  ["nativeSpam", "Spam content", "Discord's built-in spam detection"],
  ["nativePresets", "Profanity & slurs", "Discord's word-list presets"],
];

// Timeout durations offered in the punishment select (seconds → label).
export const TIMEOUTS = [
  [60, "1 minute"],
  [300, "5 minutes"],
  [600, "10 minutes"],
  [3600, "1 hour"],
  [86400, "1 day"],
  [604800, "1 week"],
];

function durationLabel(sec) {
  return TIMEOUTS.find(([s]) => s === sec)?.[1] ?? `${sec}s`;
}

function summarizeSync(res) {
  if (!res) return null;
  if (res.ok === false) {
    const why =
      res.reason === "missing_permission"
        ? "I need the **Manage Server** permission to manage AutoMod rules."
        : "Couldn't reach Discord's AutoMod API. Try again.";
    return `${EMOJIS.error} ${why}`;
  }
  const parts = [];
  if (res.created) parts.push(`${res.created} created`);
  if (res.updated) parts.push(`${res.updated} updated`);
  if (res.adopted) parts.push(`${res.adopted} adopted`);
  if (res.removed) parts.push(`${res.removed} removed`);
  if (res.failed) parts.push(`${res.failed} failed`);
  const icon = res.failed ? EMOJIS.warn : EMOJIS.success;
  return `${icon} Synced — ${parts.length ? parts.join(", ") : "no changes"}.`;
}

export function buildNativeEmbed(a, lastSync) {
  const punishments = [
    `${EMOJIS.on} Block message`,
    a.nativeAlert
      ? `${EMOJIS.on} Alert${a.nativeAlertChannelId ? ` → <#${a.nativeAlertChannelId}>` : " (no channel set)"}`
      : `${EMOJIS.off} Alert`,
    a.nativeTimeout
      ? `${EMOJIS.on} Timeout → ${durationLabel(a.nativeTimeoutSeconds ?? 300)} _(link, keyword & mention rules only)_`
      : `${EMOJIS.off} Timeout`,
  ].join("\n");

  const enabledCount = RULES.filter(([col]) => a[col]).length;
  const rules = RULES.map(
    ([col, label]) => `${a[col] ? EMOJIS.on : EMOJIS.off} ${label}`,
  ).join("\n");

  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle(`${EMOJIS.shield} Discord AutoMod (native)`)
    .setDescription(
      "Provisions real Discord Auto Moderation rules via the API — they block at Discord's edge (before the message posts) and earn the **Uses AutoMod** badge.\n\n" +
        "Pick which rules to run in the menu, tune the punishments, then press **Sync now** to apply them.",
    )
    .addFields(
      { name: "Status", value: a.nativeEnabled ? `${EMOJIS.on} Enabled` : `${EMOJIS.off} Disabled` },
      { name: `Rules (${enabledCount}/${RULES.length})`, value: rules, inline: true },
      { name: "Punishments", value: punishments, inline: true },
    );

  const note = summarizeSync(lastSync);
  if (note) embed.addFields({ name: "Last sync", value: note });
  return embed;
}

export function buildNativeView(a, ownerId, lastSync) {
  const o = ownerId;
  const toggle = (id, on, label, style = null) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(`${on ? EMOJIS.on : EMOJIS.off} ${label}`)
      .setStyle(style ?? (on ? ButtonStyle.Success : ButtonStyle.Secondary));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`am:nav:main:${o}`)
      .setLabel(`${EMOJIS.prev} Back`)
      .setStyle(ButtonStyle.Secondary),
    toggle(`am:ntog:nativeEnabled:${o}`, a.nativeEnabled, "Enabled"),
    toggle(`am:ntog:nativeAlert:${o}`, a.nativeAlert, "Alert"),
    toggle(`am:ntog:nativeTimeout:${o}`, a.nativeTimeout, "Timeout"),
  );

  // All nine rules are toggled from one multi-select (9 buttons wouldn't fit
  // Discord's five-row limit). Selected options = enabled rules.
  const rulesRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:nrules:${o}`)
      .setPlaceholder("Protection rules to run")
      .setMinValues(0)
      .setMaxValues(RULES.length)
      .addOptions(
        RULES.map(([col, label, description]) => ({
          label,
          description,
          value: col,
          default: Boolean(a[col]),
        })),
      ),
  );

  const timeoutRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`am:ntimeout:${o}`)
      .setPlaceholder("Timeout duration (for invites & mention spam)")
      .addOptions(
        TIMEOUTS.map(([value, label]) => ({
          label,
          value: String(value),
          default: (a.nativeTimeoutSeconds ?? 300) === value,
        })),
      ),
  );

  const alertRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`am:nalertch:${o}`)
      .setPlaceholder("Alert channel (where blocks are reported)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(0)
      .setMaxValues(1)
      .setDefaultChannels(...(a.nativeAlertChannelId ? [a.nativeAlertChannelId] : [])),
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`am:nsync:${o}`)
      .setLabel("Sync now")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`am:nremove:${o}`)
      .setLabel("Remove rules")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`am:close:${o}`).setLabel("Close").setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [buildNativeEmbed(a, lastSync)],
    components: [row1, rulesRow, timeoutRow, alertRow, actionsRow],
  };
}
