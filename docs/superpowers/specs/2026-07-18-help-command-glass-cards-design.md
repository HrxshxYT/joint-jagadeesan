# `/help` refurbish — category select + glass cards

**Date:** 2026-07-18
**Status:** Approved

## Goal

Replace the current multi-page `/help` pager with a richer, image-driven experience:
a **home overview glass card**, a **category dropdown** to drill into a category, and a
**second dropdown** to pick a specific command for its details. Glass imagery matches the
existing `/ping` and `/rank` cards (built on `src/lib/glassCard.js`).

## Interaction model

Single message, updated in place via component interactions. Owner-gated (only the
invoker drives it), public reply, ~150 s idle timeout then components disable.

Three states, driven by two string-select menus:

1. **home** — Home overview card + Category select. Command select hidden.
2. **category:X** — Category X's glass card + Category select + Command select (commands in X).
3. **command:Y** — Command Y's clean detail embed (no big image) + both selects retained.

Transitions:
- Category select → `🏠 Home` returns to **home**; any category → **category:X**.
- Command select (only present in category/command states) → **command:Y**.
- From **command:Y**, the user can pick another command, switch category, or go Home.

`/help <command>` (with the existing autocomplete) still replies directly with the detail
embed — unchanged. The no-arg path is what gets the new UI.

## Categories

Categories are the module folder names (raw, per user's choice — zero maintenance, auto-adapts
as modules are added). Assigned at load time by `CommandHandler` (`command.category = <folder>`).
Displayed uppercased on cards to match existing all-caps card labels ("GATEWAY LATENCY").
Current set (13): antinuke, audit, automod, config, dashboard, invites, leveling, moderation,
scan, tickets, util, watchvc, welcome. Largest is `moderation` (17 commands) — under Discord's
25-option select cap, so no option pagination. A clamp guard stays as a safety net.

## Components / files

### New: `src/modules/util/helpCard.js`
Two pure renderers on the `glassCard.js` toolkit, each returning a PNG `Buffer`:
- `buildHomeCard({ botName, categories })` — `categories: [{ name, count }]`. Header
  (`📖 <BOT> — COMMAND CENTER`), tagline, and a responsive grid of category tiles
  (uppercased name + count). Canvas height grows to fit rows.
- `buildCategoryCard({ botName, category, commands })` — `commands: string[]` (command names).
  Header (`<BOT> · HELP`), category name section, and `/command` chips wrapped into a grid.
  Canvas height grows to fit the chips.

Both use `paintBackground`, `glassPanel`, `drawText`, `accentEdge`, `ellipsize` and the `GLASS`
palette. Footer: "Developed by hrxshxforpresident" (matches other cards).

### Changed: `src/lib/components.js`
- `categorySelectRow({ categories, selected, ownerId })` → `ActionRow` with a
  `StringSelectMenuBuilder` (customId `help:cat:<ownerId>`): a `🏠 Home` option plus one per
  category (value = category name, label = uppercased). Marks `selected` as `default`. Clamps
  options to Discord's max of 25.
- `commandSelectRow({ commands, selected, ownerId })` → `ActionRow` with a
  `StringSelectMenuBuilder` (customId `help:cmd:<ownerId>`, placeholder "Pick a command for
  details"): one option per command (value/label = command name). Marks `selected` as `default`.
  Clamps to 25.

### Changed: `src/modules/util/help.js`
- Keep `groupByCategory`, `categoryNames`, `buildHelpDetailEmbed`.
- Add `categoryCounts(commands)` → `[{ name, count }]` sorted by name.
- Add `commandsInCategory(commands, category)` → sorted command-name array.
- Remove the now-unused pager builders `buildCategoryEmbed` and `buildHelpOverviewEmbed`
  (and adapt their tests).

### Changed: `src/modules/util/commands/help.js`
- No-arg path: render home card + category row, `interaction.reply`. Then loop on
  `awaitComponent` (owner-gated), **`awaitFn` injectable for tests** (mirrors `runPager`).
  Maintain state `{ level, category, command }`; each interaction `i.update()`s the
  image/embed + the appropriate rows. On a command pick, swap the image for the detail embed
  and clear the attachment (`files: []`, `attachments: []`). On timeout, disable both selects.
- `<command>` path and `autocomplete`: unchanged.

## Testing (TDD)

- `test/modules/util/helpCard.test.js` — `buildHomeCard` / `buildCategoryCard` return a
  non-empty `Buffer` for normal input and edge cases (zero categories; a category with many
  commands, e.g. moderation's 17) without throwing.
- `test/lib/components.test.js` (or existing) — `categorySelectRow` / `commandSelectRow`
  produce the expected customId + options, mark `selected` as default, and clamp at 25.
- `test/modules/util/help.test.js` — `categoryCounts` and `commandsInCategory` correctness;
  update/replace the removed pager-builder assertions.
- `test/modules/util/commands/help.test.js` — fake interaction + injected `awaitFn` drives
  home → category-pick → command-pick and asserts the right category card and command detail
  embed appear; asserts timeout disables the components.

## Out of scope (YAGNI)

- >24-category option pagination (guarded clamp only).
- Per-command glass images (detail stays a clean embed).
- Persistence across restarts (live collector, like the current pager).
