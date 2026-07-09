# Discord Bot

Public, multi-server security & moderation bot (Phase 1: foundation).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL`.
3. In the [Discord Developer Portal](https://discord.com/developers/applications), enable the
   **Server Members Intent** (privileged). The **Message Content Intent** is only needed later
   (Phase 2 automod / full message-content logging).
4. `npm run db:migrate` to create the database tables.
5. `npm run register` to register slash commands (guild-scoped if `DEV_GUILD_ID` is set, else global).
6. `npm start` (sharded) or `npm run dev` (single process, watch mode).

## Invite permissions

Least-privilege set: View Channels, Send Messages, Embed Links, Ban Members, Kick Members,
Moderate Members, Manage Roles, Manage Channels, Manage Webhooks, Manage Server,
Manage Messages, View Audit Log. (Administrator simplifies anti-nuke reliability but is optional.)

## Scripts

- `npm test` — run unit tests (Vitest)
- `npm run lint` / `npm run format`
- `npm run register` — register slash commands
- `npm start` / `npm run dev`

## Architecture

Modular monolith, shard-ready. `src/index.js` spawns per-shard clients (`src/bot.js`), each wiring
dependency-injected core services (`src/core/`) and auto-discovering feature modules
(`src/modules/*`). See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the full design.

## Status

Phase 1 foundation. Feature modules (anti-nuke, moderation, logging, config, help) land in
follow-up plans.
