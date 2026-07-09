# Discord Bot — Design Spec (Phase 1: Security & Moderation Core)

**Date:** 2026-07-09
**Status:** Approved for planning
**Scope of this spec:** Phase 1 (foundation + security/moderation core). Phases 2 and 3 are documented as a roadmap only.

---

## 1. Overview & Goals

Build a **public, multi-server Discord bot** in JavaScript/Node.js whose Phase 1 is a
best-in-class **server-security and moderation core**: an aggressive, configurable
**anti-nuke** system, a full **moderation** suite with a case system, **per-category
logging**, complete **per-guild customization** via slash commands, and a dynamic
**help** system.

Design principles:

- **Modular monolith, shard-ready** — one deployable process, auto-sharded. Each feature
  is a self-contained module.
- **Per-guild customization is a first-class concern** — every behavior configurable per
  server, read through a single config service.
- **Fail safe, never crash a shard** — every command and event handler is wrapped in
  centralized error handling.
- **Honest about platform limits** — the bot acts only within its role hierarchy and
  permissions; anti-nuke is near-real-time (audit-log driven), not instant.

### Success criteria (Phase 1)

1. Bot boots under a `ShardingManager`, connects, and registers slash commands.
2. Every guild has isolated, persisted, cached configuration.
3. Anti-nuke detects and responds to the destructive actions listed in §7 within its
   configured windows, respects the whitelist, and never actions the owner or itself.
4. Moderation commands work and every action produces a numbered, queryable case.
5. Logging routes each event category to its configured channel.
6. `/config` can fully set up the bot with no file editing.
7. `/help` is generated from loaded commands with autocomplete + pagination.

---

## 2. Non-Goals (explicitly out of Phase 1)

- Music playback (deferred; source approach to be re-decided in Phase 3).
- Web dashboard (Phase 3). All v1 config is via slash commands.
- Leveling/XP, economy, tickets, giveaways, starboard, custom tags (Phase 3).
- Invite tracking, auto-moderation content filters, welcome/autorole/reaction-roles
  (Phase 2).
- Redis / cross-shard shared state — unnecessary because a guild always lives on one
  shard, so per-guild state is in-process.

---

## 3. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Public, many servers | Per-guild isolation, shard-ready |
| Architecture | Modular monolith, sharded | Full control, simple ops, scales far enough |
| Commands | Slash commands only | Modern UX, native permissions, autocomplete |
| Music | Deferred to Phase 3 | YouTube ToS/legal risk (Rythm/Groovy precedent) |
| Database | PostgreSQL + Prisma | Robust, migrations, type-safe queries, good reporting |
| Config surface | Slash commands (`/config`) | No web infra needed in v1 |
| Build order | Phased, core-first | Each phase fully works before the next |

---

## 4. Tech Stack

- **Node.js 25**, ES modules (`"type": "module"`).
- **discord.js v14** (current stable).
- **PostgreSQL** + **Prisma** ORM (schema, migrations, generated client).
- **Zod** — validate environment variables and config input at boundaries.
- **pino** — structured logging (also feeds the Discord log-channel dispatcher).
- **node-cron** — in-process scheduling for timed unmutes, tempban expiry, cleanup.
- **dotenv** — environment configuration for local dev.
- Dev tooling: **ESLint** + **Prettier**; **Vitest** for unit tests.

---

## 5. Project Structure

```
discord-bot/
  src/
    index.js               # ShardingManager entrypoint
    bot.js                 # per-shard client bootstrap (intents, login, wiring)
    core/
      CommandHandler.js     # discover, load, register slash commands
      EventHandler.js       # discover, load gateway event listeners
      ConfigService.js      # per-guild settings: cached read, write-through to Postgres
      PermissionService.js  # command perms + role-hierarchy safety checks
      Cooldowns.js          # per-user/per-command cooldowns
      Logger.js             # pino + Discord log-channel dispatcher
      Errors.js             # centralized command/event error handling
      Scheduler.js          # node-cron jobs (unmute, tempban expiry, cleanup)
      db.js                 # Prisma client singleton
    modules/
      antinuke/            # commands + audit-log events + detection logic + schema defaults
      moderation/          # ban/kick/timeout/mute/warn/purge/lockdown/slowmode + cases
      logging/             # event listeners + per-category dispatch
      config/              # /config command tree (buttons + select menus)
      help/                # dynamic help command
    lib/
      embeds.js            # branded embed builders (success/error/info)
      pagination.js        # button-based paginated embeds
      duration.js          # "10m", "2h", "7d" -> ms parser
      hierarchy.js         # role-position comparison helpers
      constants.js         # colors, emojis, limits
  prisma/
    schema.prisma
  docs/superpowers/specs/  # this spec
  .env.example
  package.json
  README.md
```

Each `modules/*` folder exports its commands and event listeners; the handlers
auto-discover them. A module can be understood and tested without reading the others.

---

## 6. Data Model (Prisma outline)

Tables (final columns settled during planning/implementation):

- **Guild** — one row per server. Holds top-level toggles and foreign keys to config
  sub-records. `id` = Discord guild snowflake (string).
- **AntinukeConfig** — `guildId`, `enabled`, per-action thresholds & window seconds
  (JSON or discrete columns), default punishment enum, autoRevert bool, alertChannelId,
  quarantineRoleId, antiRaid settings, panicMode bool.
- **Whitelist** — `guildId`, `targetId`, `type` (user|role), added-by, timestamp. Trusted
  entities that bypass anti-nuke.
- **LoggingConfig** — `guildId`, per-category channel IDs (memberJoinLeave, messageEdit,
  messageDelete, modActions, roleChanges, channelChanges, voice, serverChanges) + per-
  category enabled flags.
- **ModRole** — roles allowed to use moderation commands (in addition to Discord perms).
- **Case** — `guildId`, incrementing per-guild `caseNumber`, `type`
  (ban|tempban|softban|kick|timeout|mute|warn|unban|unmute), `targetId`, `moderatorId`,
  `reason`, `createdAt`, `expiresAt` (for tempban/timeout/mute), `active` flag.
- **Infraction/Warn history** is derived from `Case` (warns are cases of type `warn`).

Per-guild `caseNumber` is allocated atomically (transaction) to avoid gaps/races.

---

## 7. Anti-Nuke Design (centerpiece)

**Trigger source:** `GuildAuditLogEntryCreate` gateway event (discord.js v14). Each entry
names the **executor**; the bot rate-limits destructive actions per-executor in sliding
windows.

### Watched actions (each independently configurable: threshold + window + on/off)

- Channel **create / delete / update**
- Role **create / delete**, and **dangerous permission grants** (granting
  `Administrator` or other dangerous perms to a role/member)
- **Ban / kick** (mass)
- **Member prune**
- **Webhook create / delete** (classic nuke/spam vector)
- **Unauthorized bot adds** (a new bot joining)
- **Guild update** (name / icon / **vanity URL** changes)
- **Mass emoji / sticker deletion**

### Detection

For each watched entry: identify executor → if executor is whitelisted, the guild owner,
the bot itself, or a role above the bot, **skip enforcement** (owner/self protection).
Otherwise increment a per-executor, per-action counter in an in-memory sliding window. If
the count exceeds the configured threshold within the window → **trigger response**.

### Response (configurable default punishment)

- **Punish the executor:** `ban` | `kick` | `strip all roles` | `quarantine` (apply a
  restricted role) | `remove dangerous perms`. Default: **ban** (configurable).
- **Auto-revert (optional):** recreate a deleted channel/role, unban a mass-banned user,
  delete a rogue webhook. Limits: a recreated channel cannot restore old message history.
- **Alert:** post an incident embed to the configured alert channel (what happened, who,
  action taken).

### Extra protections

- **Whitelist** — trusted users/roles bypass all enforcement.
- **Anti-raid** — sudden join-spike detection (N joins within T seconds) → auto-enable a
  raid mode (e.g., kick/verify new joins) until cleared.
- **Panic / lockdown** — a command to freeze role-permission changes and lock the server
  during an active attack.
- **Self-protection invariants** — never punish the guild owner or the bot; require the
  bot's role to be high enough; degrade gracefully (alert-only) when it lacks permission.

### Honest limitations

- Acts only within its **role hierarchy** and granted permissions.
- Audit logs arrive with a small delay → **near**-real-time, not instant.
- Auto-revert restores structure, not deleted message history.

---

## 8. Moderation Suite

Commands (slash): `ban`, `tempban`, `softban`, `unban`, `kick`, `timeout`
(native), `mute` / `unmute` (role-based, for servers preferring a mute role), `warn`,
`warnings` (list), `case` (view/edit/delete), `purge` / `clean`, `lockdown` / `unlock`,
`slowmode`, `nick`.

- Every action creates a **numbered Case** (§6) with moderator, target, reason,
  timestamps, and expiry where relevant.
- **Hierarchy enforcement** via `PermissionService`: a moderator cannot action someone at
  or above their top role, nor above the bot.
- Timed actions (`tempban`, `timeout`, `mute`) are restored/expired by the **Scheduler**.
- DM-on-action (notify the user with reason) is a per-guild toggle.

---

## 9. Logging

Per-guild `LoggingConfig` maps event **categories** to channels, each independently
toggleable:

- Member join / leave
- Message edit / delete (bulk delete summarized)
- Moderation actions (mirrors case creation)
- Role changes / channel changes / server (guild) changes
- Voice state changes

The `Logger` core dispatches formatted embeds to the configured channel for each
category. Missing/invalid channels degrade silently (logged internally, never crash).

**Note on intents:** message-content logging of *edited/deleted content* requires the
privileged **MessageContent** intent; without it, edit/delete logs show metadata only.
Phase 1 will log metadata + cached content where available and document the intent
requirement.

---

## 10. Configuration Surface (`/config`)

A single `/config` command tree with subcommands and interactive components
(buttons + select menus) to configure:

- Logging channels + category toggles
- Moderation roles, DM-on-action toggle, default reasons
- Anti-nuke: enable/disable, per-action thresholds/windows, default punishment,
  auto-revert, alert channel, quarantine role, anti-raid, whitelist add/remove
- View current settings (`/config view`) and reset (`/config reset`)

All writes go through `ConfigService` (cache + Postgres write-through).

---

## 11. Help System

`/help` auto-generates from loaded command metadata:

- No arg → category overview (Security, Moderation, Logging, Config, Utility),
  paginated with buttons.
- `/help <command>` → detailed usage, arguments, required permissions, examples.
- Command name **autocomplete**.

---

## 12. Intents & Permissions

**Gateway intents (Phase 1):** `Guilds`, `GuildMembers` (privileged — must be enabled in
the Developer Portal), `GuildModeration`, `GuildWebhooks`, `GuildInvites`,
`GuildEmojisAndStickers`, `GuildVoiceStates` (for voice logging). **MessageContent**
(privileged) is only needed for full message edit/delete content logging and Phase 2
auto-mod; documented and optional in Phase 1.

**Bot permissions requested at invite:** Administrator is simplest for anti-nuke
reliability, but the README will document the least-privilege set (Ban, Kick, Manage
Roles, Manage Channels, Manage Webhooks, Moderate Members, View Audit Log, Manage Guild,
Manage Messages, View Channels, Send Messages, Embed Links).

---

## 13. Error Handling & Resilience

- Every command/event runs inside a try/catch funneled to `core/Errors.js`; user-facing
  failures return a friendly ephemeral embed, internal details go to pino.
- Unhandled rejections/exceptions are caught at the process level per shard and logged;
  a shard restarts via the `ShardingManager` rather than taking others down.
- All Discord API calls that can fail on permission/hierarchy are guarded and degrade to
  alert-only where enforcement is impossible.

---

## 14. Testing Strategy

- **Unit tests (Vitest)** for pure logic: duration parser, hierarchy comparisons,
  anti-nuke sliding-window counter, threshold/whitelist decisioning, case-number
  allocation.
- **Handler/config tests** with a mocked Prisma client and mocked discord.js structures.
- Anti-nuke decision engine is written as a **pure function** (inputs: event, config,
  counters → decision) so it is fully unit-testable without a live gateway.
- Manual verification checklist in the README for live-server smoke testing.

---

## 15. Environment / Setup

- `.env`: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`, `NODE_ENV`,
  `DEV_GUILD_ID` (for instant guild-scoped command registration in dev),
  `SHARD_COUNT` (optional; `auto` by default).
- `npm run db:migrate`, `npm run register` (slash-command registration),
  `npm run dev` / `npm start`.
- README documents Developer Portal setup (privileged intents), Postgres provisioning,
  and the invite URL with the permission set from §12.

---

## 16. Roadmap (documented, not built in Phase 1)

**Phase 2 — Growth & engagement**
- Invite tracker (who invited whom, real/fake/left counts, leaderboard, invite-role
  rewards)
- Auto-moderation (spam, mention spam, link/invite filters, word blacklist, caps, raid
  mode) — requires MessageContent intent
- Welcome / goodbye messages, autorole, reaction roles

**Phase 3 — Parity & extras**
- Music (revisit source: Lavalink vs non-YouTube sources)
- Leveling / XP, economy, tickets, giveaways, starboard, custom tags/commands
- Web dashboard (React/Next.js + Discord OAuth2)

---

## 17. Open Items for the Plan

- Exact Prisma columns vs. JSON blobs for per-action anti-nuke thresholds.
- Default threshold/window numbers per anti-nuke action (sane, tunable defaults).
- Whether quarantine role is auto-created or admin-provided.
- Bot name/branding (folder currently `discord-bot`; rename is cosmetic).
