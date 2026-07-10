import { brandEmbed } from "../../lib/embeds.js";
import { EMOJIS } from "../../lib/constants.js";

export const TUTORIAL_CHAPTERS = [
  {
    title: `${EMOJIS.book} Getting Started`,
    body:
      "Welcome to **Joint Jagadeesan** — an all-in-one moderation, security, and community bot.\n\n" +
      "**First steps**\n" +
      "• Make sure my role sits **near the top** of your role list — I can't action members above me.\n" +
      "• Run `/config view` to see your server settings.\n" +
      "• Set moderator roles with `/config modrole add @role` so trusted staff can use mod commands.\n\n" +
      "Use the ◀️ ▶️ buttons below to page through this guide.",
  },
  {
    title: `${EMOJIS.mod} Moderation`,
    body:
      "Every action is recorded as a numbered **case**.\n\n" +
      "**Commands:** `/ban` `/kick` `/timeout` `/mute` `/warn` `/purge` `/softban` `/tempban` and their reversals (`/unban`, `/untimeout`, `/unmute`).\n" +
      "**Confirmations:** destructive actions (ban/kick/unban/purge…) ask you to **Confirm** first.\n" +
      "**History:** `/warnings` and `/case` let you review and edit past actions.\n" +
      "Set a channel for mod logs via `/logging set modActions #channel`.",
  },
  {
    title: `${EMOJIS.shield} Anti-Nuke`,
    body:
      "Protects against mass-destruction and rogue admins.\n\n" +
      "• `/antinuke enable` turns on protection; configure per-action thresholds (mass ban/kick/channel-delete/role-delete/webhook spam).\n" +
      "• **Whitelist** trusted users/bots with `/antinuke whitelist add`.\n" +
      "• **Anti-raid** auto-acts on floods of new joins; **panic mode** locks the server down.\n" +
      "• Set an alert channel so you're notified the instant something trips.",
  },
  {
    title: `${EMOJIS.gear} Auto-Moderation`,
    body:
      "Automatically filters bad messages.\n\n" +
      "• `/automod enable`, then pick an action with `/automod action` (delete / warn / timeout).\n" +
      "• Toggle filters: **spam**, **mention-spam**, **invite links**, **external links**, **mass-caps**, **emoji spam**.\n" +
      "• `/automod panel` gives you a **button dashboard** to flip filters on/off by clicking.\n" +
      "• Exempt roles/channels with `/automod exempt`.",
  },
  {
    title: `${EMOJIS.log} Logging & Audit Log`,
    body:
      "Two complementary systems:\n\n" +
      "• **`/logging`** — route each category (joins, message edits/deletes, roles, channels, voice…) to its **own** channel.\n" +
      "• **`/auditlog`** — a single **consolidated feed** of *everything* that changes in the server, to one channel. `/auditlog channel #log` to start, `/auditlog events` to pick what's tracked.\n" +
      "Use logging for tidy per-category channels, auditlog for one all-seeing feed.",
  },
  {
    title: `${EMOJIS.wave} Welcome & Roles`,
    body:
      "Onboard new members automatically.\n\n" +
      "• `/welcome set-channel` + `/welcome set-message` — greet joins; `/welcome goodbye-channel` for farewells. Placeholders: `{mention} {user} {username} {server} {memberCount}`.\n" +
      "• `/autorole add @role` — give roles to everyone on join.\n" +
      "• `/reactionrole add <message_id> <emoji> @role` — let members self-assign roles by reacting.",
  },
  {
    title: `${EMOJIS.invite} Invite Tracking`,
    body:
      "See who's growing your server.\n\n" +
      "• `/invites view [user]` — a member's total / regular / left / bonus invites.\n" +
      "• `/invites leaderboard` — top inviters (paged with buttons).\n" +
      "• `/invites add` / `/invites reset` — adjust bonus invites (Manage Server).\n" +
      "I need **Manage Server** to read the invite list.",
  },
  {
    title: `${EMOJIS.star} Tips & Support`,
    body:
      "• `/help` lists every command; `/help <command>` explains one.\n" +
      "• Most config commands need **Administrator**; moderation needs the matching permission or a mod role.\n" +
      "• Buttons are usable only by the person who ran the command, and expire after a few minutes — just re-run the command to get fresh controls.\n\n" +
      "That's the tour — enjoy Joint Jagadeesan! 🎉",
  },
];

export function chapterCount() {
  return TUTORIAL_CHAPTERS.length;
}

export function renderChapter(index) {
  const i = Math.max(0, Math.min(TUTORIAL_CHAPTERS.length - 1, index));
  const ch = TUTORIAL_CHAPTERS[i];
  return brandEmbed({
    title: `${ch.title}  ·  ${i + 1}/${TUTORIAL_CHAPTERS.length}`,
    description: ch.body,
  });
}
