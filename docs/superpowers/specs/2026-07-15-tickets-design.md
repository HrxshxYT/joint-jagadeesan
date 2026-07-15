# Ticket / Support System — design (Phase 2, feature 2 of 4)

**Date:** 2026-07-15

## Goal

A channel-based support-ticket system. Admins configure everything from a
**single interactive `/tickets` control panel** and can publish **multiple ticket
panels** in one server. Each published panel offers members a **category
dropdown**; picking a category opens a private ticket **channel** under a Discord
category, with staff access, an optional reason modal, claim/assign, add/remove
members, a two-stage close, and a plain-text transcript on deletion.

This is the second of four Phase 2 subsystems (see [[phase2-scope]] — tickets,
leveling, starboard, giveaways), each built as its own spec → plan → build cycle.
Leveling shipped 2026-07-12; this is tickets.

## Decisions (locked with the user)

- **Ticket instance:** **channel per ticket** (`#prefix-0042`) created under a
  Discord category, with per-channel permission overwrites. Not threads.
- **Panel open UX:** each published panel has a **category dropdown** (1..N
  categories). A single-category panel still renders as a dropdown for
  consistency (no special-case button path).
- **Features included:** reason modal on open, claim/assign, add/remove members,
  transcript on close.
- **Close flow:** **two-stage** — Close → confirm → *archived* (opener removed,
  renamed `closed-0042`, staff-only Reopen / Transcript / Delete) → Delete
  destroys the channel after saving the transcript.
- **Transcript format:** **plain-text `.txt`** attachment (author, timestamp,
  content, attachment links). No HTML rendering.
- **Persistent interactions:** the published panel and in-ticket buttons use a
  new **namespaced `ticket:` custom-id router** (restart-safe, state rehydrated
  from Postgres), kept isolated from the existing per-message-collector
  convention.

## Architecture

New module `src/modules/tickets/`, following the `automod`/`welcome` shape.

```
src/modules/tickets/
  commands/tickets.js          # /tickets → opens the admin control panel
  TicketService.js             # all DB access: config, panels, categories, tickets, numbering
  panel/                       # ADMIN control panel — ephemeral, existing runPanel loop
    index.js  render.js  handlers.js
  published/
    render.js                  # buildPublishedPanel(panel, categories) → message payload
  lifecycle/
    open.js                    # create channel + overwrites, reason modal, first message
    close.js                   # archive → transcript → reopen/delete state machine
    members.js                 # add/remove user overwrites
    claim.js                   # claim/assign
  transcript.js                # fetched messages → .txt buffer (pure formatting core)
  router.js                    # dispatch for `ticket:*` custom-ids (Option A)
  events/interactionCreate.js  # thin: id.startsWith("ticket:") → router.handle(); else return
  constants.js                 # custom-id build/parse, DEFAULTS, limits
```

### Two interaction worlds, kept separate

- **Admin control panel** (`/tickets`) reuses the existing ephemeral `runPanel`
  collector loop (`src/lib/panel.js`) — no new pattern, matches antinuke/automod/
  welcome panels.
- **Published panel + in-ticket buttons** use the persistent `ticket:` router.
  Custom-ids are **stateless** (carry only ids); handlers rehydrate state from
  Postgres, so everything survives a bot restart.

### Persistent routing (Option A)

A new listener `src/modules/tickets/events/interactionCreate.js` (auto-discovered
like other module events) runs on `InteractionCreate`. If the interaction is a
message component or modal submit whose `customId` starts with `ticket:`, it
calls `router.handle(interaction, ctx)` and returns. Otherwise it does nothing —
so the existing `src/modules/util/events/interactionCreate.js` (which early-
returns on message components) is **untouched**; the two listeners coexist.

Custom-id grammar (built/parsed in `constants.js`):

```
ticket:open:<panelId>            # category dropdown on the published panel
ticket:openmodal:<panelId>:<categoryId>  # reason-modal submit (carries the picked category)
ticket:claim:<ticketId>
ticket:members:<ticketId>        # opens a user-select
ticket:memberpick:<ticketId>     # the user-select submit
ticket:close:<ticketId>
ticket:closeconfirm:<ticketId>
ticket:reopen:<ticketId>
ticket:transcript:<ticketId>
ticket:delete:<ticketId>
```

## Data model (Prisma)

Follow existing conventions: cuid ids for multi-row models, `guildId @id` for the
per-guild singleton, `Json @default("[]")` for lists, `onDelete: Cascade`
relations off `Guild`. Migrations generated offline with
`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
then `npx prisma generate` (no live DB needed for logic work).

- **`TicketConfig`** — per-guild singleton settings.
  `guildId @id`, `enabled Boolean @default(true)`,
  `transcriptChannelId String?`, `dmTranscript Boolean @default(false)`,
  `logChannelId String?`, `maxOpenPerUser Int @default(1)` (per category; `0` =
  unlimited).

- **`TicketPanel`** — one published panel message.
  `id cuid`, `guildId`, `name` (admin label), `title`, `description`,
  `channelId String?`, `messageId String?` (null until published), `createdAt`.
  `categories TicketCategory[]`. `@@index([guildId])`.

- **`TicketCategory`** — a dropdown option within a panel.
  `id cuid`, `panelId`, `label`, `emoji String?`, `description String?`,
  `discordCategoryId String?` (parent for new channels), `staffRoleIds Json
  @default("[]")`, `namePrefix String @default("ticket")`, `welcomeMessage String
  @default("Thanks {mention}, staff will be with you shortly.")`,
  `reasonPrompt String?` (if set, show the reason modal with this question),
  `position Int @default(0)`. `onDelete: Cascade` from panel.

- **`Ticket`** — a live/archived ticket instance.
  `id cuid`, `guildId`, `number Int`, `panelId String?`, `categoryId String?`
  (both nullable so history survives panel/category edits), `channelId String
  @unique`, `openerId`, `claimedById String?`,
  `status String @default("open")` (open | archived | closed), `reason String?`,
  `createdAt`, `closedAt DateTime?`.
  `@@unique([guildId, number])`, `@@index([guildId, status])`,
  `@@index([openerId, status])`.

- **`TicketCounter`** — per-guild monotonic ticket number.
  `guildId @id`, `next Int @default(1)`. Incremented inside the same transaction
  as `Ticket` creation (atomic upsert) so concurrent opens never collide.

`Guild` gains relations: `ticketConfig TicketConfig?`, `ticketPanels
TicketPanel[]`, `tickets Ticket[]`, `ticketCounter TicketCounter?`.

## The single admin control panel (`/tickets`)

Command `/tickets`, gated to Administrator + configured mod roles (same
`permissions` + `canUseCommand` path as other admin commands). Opens the ephemeral
`runPanel` loop. In-memory `state` holds the loaded config + panels; every mutation
writes through `TicketService` then re-renders.

- **Home view:** global settings summary (enabled, transcript channel, DM
  transcript, log channel, max-open-per-user) with toggle buttons + channel/number
  selects; a select listing existing panels; **➕ New Panel** button.
- **Panel editor view:** shows one panel — edit title/description (modal); a
  category list with add/edit/remove (each edit is a modal + role/channel
  selects for staff roles and the Discord parent category); **📢 Publish /
  Re-publish** (channel-select → post or edit the published message); **🗑 Delete
  panel**; **⬅ Back**.

Publishing builds the published-panel payload and posts it to the chosen channel,
storing `channelId`/`messageId`. Re-publish edits the existing message in place if
it still exists, else posts a fresh one and updates the ids.

## Published panel (persistent)

`published/render.js` → `buildPublishedPanel(panel, categories)` returns an embed
(title/description) + a string-select (`ticket:open:<panelId>`) whose options are
the panel's categories (label, emoji, description). Restart-safe: no collector, the
router owns it.

## Ticket lifecycle

All steps run through `router.handle` and are wrapped in the existing
`runSafely`/try-catch idiom; failures reply ephemerally.

1. **Open** (`ticket:open:<panelId>`, select) — resolve category; enforce
   `maxOpenPerUser` (count the opener's `status=open` tickets in that category;
   archived/closed do not count); if `reasonPrompt` set, respond to the select
   with a modal (`ticket:openmodal:<panelId>:<categoryId>`) and continue on its
   submit — otherwise create immediately. Preflight bot
   perms (ManageChannels, ManageRoles). Allocate `number` via `TicketCounter`
   upsert in the same transaction as the `Ticket` insert. Create channel
   `#<namePrefix>-<number>` under `discordCategoryId` with overwrites: deny
   `@everyone` ViewChannel; allow opener + each staff role View/Send/History.
   Post welcome embed (rendered `welcomeMessage`, opener mention, reason) + control
   row: **Claim**, **Members**, **Close**. Reply ephemerally with a link.

2. **Claim** (`ticket:claim:<ticketId>`) — staff-only; set `claimedById`; update
   the header/embed to show the claimer. Toggle (unclaim) if the claimer clicks
   again.

3. **Members** (`ticket:members:<ticketId>`) — staff-only; show a user-select
   (`ticket:memberpick:<ticketId>`); on submit toggle that user's channel
   overwrite (add if absent, remove if present) and post a system line.

4. **Close** (`ticket:close:<ticketId>`) — confirm button
   (`ticket:closeconfirm`); on confirm set `status=archived`, remove opener's
   ViewChannel overwrite, rename to `closed-<number>`, swap control row to
   **Reopen / Transcript / Delete**.

5. **Reopen** (`ticket:reopen:<ticketId>`) — staff-only; restore opener overwrite,
   rename back, restore the open control row, `status=open`.

6. **Transcript** (`ticket:transcript:<ticketId>`) — build the `.txt` now and post
   it in-channel (lets staff preview before deleting).

7. **Delete** (`ticket:delete:<ticketId>`) — staff-only; build the transcript, post
   it to `transcriptChannelId` (and DM the opener if `dmTranscript`), set
   `status=closed` + `closedAt`, then delete the channel.

Optional open/close audit lines to `logChannelId` when set.

## Transcript

`transcript.js` fetches the channel's messages (paginated, oldest→newest, capped
at a sane max) and formats each as `[YYYY-MM-DD HH:mm] Author: content` with
attachment URLs appended and embeds noted. The pure formatting core
(`formatTranscript(messages, meta) → string`) is unit-tested with plain objects;
the fetch/attachment wrapper is thin. Output is a `Buffer` attached as
`<prefix>-<number>.txt`.

## Permissions & safety

- Command gated via `permissions: [Administrator]` + mod-role path.
- Staff-only buttons (claim/members/close/reopen/delete) re-check the caller's
  roles against the ticket category's `staffRoleIds` (plus Administrator /
  ManageChannels) inside the handler — never trust the client.
- Preflight the bot's ManageChannels/ManageRoles before channel creation; on
  missing perms reply with a clear ephemeral error.
- Graceful degradation: deleted parent category, deleted published message, hit
  Discord channel limits, or a ticket row whose channel no longer exists → clean
  ephemeral error, no throw.
- Rehydration: every router handler loads its `Ticket`/`Panel` fresh from
  Postgres by id, so a restart mid-lifecycle loses nothing.

## Wiring

- Prisma models + migration; `npx prisma generate`.
- `TicketService` constructed in `bot.js` and exposed on `ctx` (e.g.
  `ctx.tickets`), matching how `ctx.leveling` etc. are wired.
- Module events/commands auto-discovered by the existing loaders.
- Register `/tickets` via `npm run register` after merge (global, per current
  `.env`).

## Testing

Match the repo's ~440-test bar; real tests, no placeholders. Discord side effects
(channel create/delete, overwrites, message fetch) are mocked.

- `constants.js` — custom-id build/parse round-trips for every `ticket:*` id.
- `transcript.js` — `formatTranscript` over crafted message lists (content,
  attachments, embeds, ordering, empty).
- `published/render.js` — dropdown options map from categories; single-category
  still renders a select.
- `panel/render.js` — home + panel-editor views render expected components.
- `TicketService` — number allocation is monotonic/atomic (concurrent opens),
  open-limit counting, CRUD for panels/categories.
- `router.js` — dispatch routes each id to the right handler; unknown/`ticket:`-
  but-unrecognized id → safe no-op ephemeral; staff-only guard rejects
  non-staff. Mirrors the automod/welcome handler tests.

## Non-goals (YAGNI for this cycle)

Ticket priorities/tags, SLA timers, feedback/rating on close, ticket search UI,
HTML transcripts, per-category (vs per-user) numbering. Can be follow-ups.
