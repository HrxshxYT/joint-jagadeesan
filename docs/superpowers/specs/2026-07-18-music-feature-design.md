# Music feature + purple retheme

**Date:** 2026-07-18
**Status:** Approved

## Goals

1. A full-fledged music player for the bot, backed by **Lavalink** (via `lavalink-client@2`),
   with a rich purple Now-Playing embed (thumbnail + progress bar) and player buttons.
2. Retheme every embed to purple to match the glass cards, keeping status cues.

## Decisions (from brainstorming)

- **Backend:** Lavalink node (user-provided). Client lib: `lavalink-client`.
- **Now Playing:** rich purple embed with track thumbnail + text progress bar (not a live
  ticking bar — re-rendered on button presses / track change).
- **Depth:** core + extras — play, pause, resume, skip, stop, queue, nowplaying, volume,
  loop, shuffle, remove, clear, seek, filter, autoplay.
- **Sources:** YouTube/SoundCloud + Spotify/Apple (Spotify/Apple require the LavaSrc plugin on
  the node; without it those links fail gracefully).
- **Control:** anyone in the **same voice channel** as the bot. No DJ role in v1.
- **Theme:** `brand`/`info`/`muted` → purple; `success`/`error`/`warn` keep green/red/amber.

## Part A — Purple retheme

`src/lib/constants.js` `COLORS`:
- `brand`: `0x2ecc71` → `0x8b5cf6`
- `info`: `0x2ecc71` → `0x8b5cf6`
- `muted`: `0x1f8b4c` → `0x6d5b9e`
- `success` `0x57f287`, `warn` `0xfee75c`, `error` `0xed4245` — unchanged.

Every embed reads `COLORS`, so this recolors the whole bot. Update any test asserting the old
brand/info/muted numeric values.

## Part B — Music module (`src/modules/music/`)

### Config / env (`src/config/env.js`)
Add optional: `LAVALINK_HOST`, `LAVALINK_PORT` (coerce int), `LAVALINK_PASSWORD`,
`LAVALINK_SECURE` (coerce bool, default false). Exposed on the env object as a `lavalink`
sub-object (or `null` when host is unset).

### `MusicService.js`
Wraps `LavalinkManager`.
- Constructor `{ client, logger, config }` where `config` is the parsed `env.lavalink` (or null).
- `isEnabled` = config present. When disabled, `manager` is null and all lookups are no-ops.
- Builds `new LavalinkManager({ nodes: [{ id: "main", host, port, authorization, secure }],
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
  client: { id: "", username: "Suzune" }, playerOptions: { defaultSearchPlatform: "ytsearch",
  onDisconnect: { autoReconnect: true, destroyPlayer: false }, onEmptyQueue: { ... } } })`.
- `init(clientUser)` → `manager.init({ id: clientUser.id, username })`.
- Helpers: `getPlayer(guildId)`, `createPlayer({ guildId, voiceChannelId, textChannelId })`.
- Wires manager events (see Lifecycle). Pure event **handlers** live in a separate, tested
  module; the service just registers them.

### Events (`src/modules/music/events/`)
- `ready.js` — `ctx.music.init(client.user)` (only if enabled).
- `raw.js` — `name: "raw"`; `ctx.music.manager?.sendRawData(packet)`.
- `interactionCreate.js` — component router: if `customId` starts with `music:`, dispatch to
  the control handler (mirrors `tickets/events/interactionCreate.js`).

### `bot.js`
Add `music: new MusicService({ client, logger, config: env.lavalink })` to `context`.
`MusicService` registers manager event handlers in its constructor; `ready.js` calls `init`.

### Lifecycle (`lifecycle.js` — tested pure handlers)
- `onTrackStart(player, track, deps)` → build Now-Playing payload, post it in the player's
  text channel, store the message id on the player (`player.set("npMessageId", id)`); delete/
  replace the previous NP message.
- `onQueueEnd(player, deps)` → if autoplay on, enqueue a recommendation; else schedule an
  idle disconnect after N minutes; edit NP embed to "queue ended".
- `onTrackError` / `onTrackStuck` → skip + notify.
`deps` (channel fetch, logger) are injected so handlers are unit-testable without Lavalink.

### Now Playing (`nowPlaying.js`)
- `buildNowPlaying({ track, player })` → `{ embeds: [EmbedBuilder], components: [rows] }`.
  Embed: color `COLORS.brand`, thumbnail = track artwork, title (linked to track uri), author
  = artist, description = progress bar line, fields = requester / volume / loop / filter /
  "up next" + queue length, footer.
- Buttons (`music:pause`, `music:skip`, `music:stop`, `music:loop`, `music:shuffle`,
  `music:queue`). Pause button label reflects paused state. Disabled sensibly (e.g. shuffle
  when queue < 2).

### Controls (`controls.js` — tested)
`handleControl(interaction, ctx)`:
1. Guard: player exists, and `interaction.member` is in the **same** voice channel
   (`sameVoiceChannel(member, player)` helper). Else ephemeral error.
2. Switch on the action suffix; mutate the player (`pause/resume/skip/stop/…`).
3. Re-render Now Playing via `interaction.update(buildNowPlaying(...))` (or ephemeral queue).

### Format helpers (`format.js` — tested)
- `formatDuration(ms)` → `m:ss` / `h:mm:ss`.
- `progressBar(positionMs, durationMs, width)` → `1:23 ━━━●───── 3:32`.

### Guards (`guards.js` — tested)
- `sameVoiceChannel(member, player)` → boolean.
- `memberVoiceChannelId(member)` → id | null.

### Commands (`src/modules/music/commands/`)
Each: if `!ctx.music.isEnabled` → ephemeral "Music isn't configured."; else same-VC/permission
guard → act → reply. `play` also resolves search/URL and connects if no player.
Files: `play`, `pause`, `resume`, `skip`, `stop`, `queue`, `nowplaying`, `volume`, `loop`,
`shuffle`, `remove`, `clear`, `seek`, `filter`, `autoplay`.
They form a new `music` category, auto-listed in `/help`.

## Testing (TDD)

Lavalink needs a live node, so tests target pure / injectable logic (mocked player objects):
- `format` — duration + progress bar (incl. zero/over-length edges).
- `guards` — same-VC true/false, no-voice member.
- `nowPlaying` — embed fields + button customIds + paused/loop state reflected; shuffle
  disabled when queue < 2.
- `controls` — same-VC rejection is ephemeral; each action calls the right player method and
  re-renders; unknown action ignored.
- `lifecycle` — `onTrackStart` posts + stores message id; `onQueueEnd` autoplay vs idle path;
  error handler skips.
- command logic against a mocked `ctx.music`/player — `volume` range validation, `skip` calls
  `player.skip`, disabled-service replies "not configured", `play` with empty results replies.
- `MusicService` — disabled stub (no manager, helpers safe) and node-config parsing.
- `env` — lavalink sub-object parsed when present, `null` when absent.

Thin Lavalink glue (manager construction, `init`, `sendRawData`, node connect) stays minimal
and is not unit-tested (no live node), matching how `watchvc` injects real deps.

## Runtime verification & handoff

Code + unit tests can be completed without a node. **Actual audio playback cannot be verified
here** — requires the user's `LAVALINK_*` env + a running node. Spotify/Apple need the LavaSrc
plugin on that node. The feature degrades gracefully (disabled → clear message) when unset.

## Out of scope (YAGNI)

DJ roles, per-guild persisted queues across restart, lyrics, playlists saved to DB, dashboards.
