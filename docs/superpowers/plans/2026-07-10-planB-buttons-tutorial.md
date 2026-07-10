# Plan B — Buttons on Commands + `/tutorial` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add interactive button navigation/confirmation to key commands and a guided `/tutorial`, all reusing the Stage 1 primitives.

**Architecture:** Two generic collector loops (`runPager`, `runToggler`) drive every button UI; pure render/data functions are unit-tested, the loops are tested with an injected fake `awaitFn`. Navigation is all-button (prev/next via `pageRow`), owner-gated, timeout-disabling.

**Tech Stack:** Node.js 25 ESM, discord.js v14, Vitest.

## Global Constraints
- Green theme, `BOT_NAME` = Joint Jagadeesan. TDD, commit per task. Owner-gated collectors, ~2-3 min timeout, buttons disable on expiry. Reuse `paginate/pageRow/confirmRow/toggleRow/awaitButton/disableAll/brandEmbed` from Stage 1.

---

### Task 1: Generic navigator loops
**Files:** Create `src/lib/navigator.js`; Test `test/lib/navigator.test.js`
**Interfaces (Produces):**
- `runPager({ interaction, count, render, ownerId, awaitFn?, timeMs? })` — replies with `render(0)` + `pageRow`, then on each owner prev/next click edits to the new page; disables buttons on timeout. `render(page)->EmbedBuilder`.
- `runToggler({ interaction, buildItems, onToggle, renderEmbed, ownerId, awaitFn?, timeMs? })` — replies with `renderEmbed()` + `toggleRow(buildItems())`; on `toggle:<key>:<owner>` click calls `onToggle(key)` then re-renders.

Tests: fake interaction records `reply/fetchReply/editReply`; fake `awaitFn` yields a scripted sequence of `{ customId, update }` then `null`. Assert page index moves and `onToggle` is called with the key.

Implementation:
```js
import { pageRow, toggleRow } from "./components.js";
import { awaitButton, disableAll } from "./collect.js";

export async function runPager({ interaction, count, render, ownerId, awaitFn = awaitButton, timeMs = 150000 }) {
  let page = 0;
  const payload = () => ({ embeds: [render(page)], components: count > 1 ? [pageRow({ page, pageCount: count, ownerId })] : [] });
  await interaction.reply(payload());
  if (count <= 1) return;
  const message = await interaction.fetchReply();
  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;
    if (i.customId === `page:prev:${ownerId}`) page = Math.max(0, page - 1);
    else if (i.customId === `page:next:${ownerId}`) page = Math.min(count - 1, page + 1);
    await i.update(payload());
  }
  await interaction
    .editReply({ components: disableAll([pageRow({ page, pageCount: count, ownerId })]) })
    .catch(() => {});
}

export async function runToggler({ interaction, buildItems, onToggle, renderEmbed, ownerId, awaitFn = awaitButton, timeMs = 150000 }) {
  const payload = () => ({ embeds: [renderEmbed()], components: toggleRow(buildItems(), ownerId) });
  await interaction.reply(payload());
  const message = await interaction.fetchReply();
  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;
    const parts = i.customId.split(":");
    if (parts[0] === "toggle") await onToggle(parts[1]);
    await i.update(payload());
  }
  await interaction.editReply({ components: disableAll(toggleRow(buildItems(), ownerId)) }).catch(() => {});
}
```

---

### Task 2: `/tutorial` command
**Files:** Create `src/modules/util/tutorial.js` (data + `renderChapter`), `src/modules/util/commands/tutorial.js`; Test `test/modules/util/tutorial.test.js`
**Interfaces:** `TUTORIAL_CHAPTERS` (array of `{ title, body }`), `renderChapter(i)->EmbedBuilder`, `chapterCount()`.
- `renderChapter(i)` uses `brandEmbed({ title, description })` with a `Chapter i/N` prefix.
- Command: `runPager({ interaction, count: chapterCount(), render: renderChapter, ownerId: interaction.user.id })`.
Tests: `renderChapter(0)` returns a green embed containing the first chapter's title; out-of-range clamps; command initial reply contains an embed. Chapters cover Getting Started, Moderation, Anti-Nuke, Auto-Moderation, Logging & Audit Log, Welcome & Roles, Invite Tracking, Tips.

---

### Task 3: Interactive `/help`
**Files:** Modify `src/modules/util/help.js` (add `categoryNames(commands)`, `buildCategoryEmbed(commands, index)`); Modify `src/modules/util/commands/help.js`; Test extend `test/modules/util/*`.
- `categoryNames(commands)->string[]` sorted; `buildCategoryEmbed(commands, index)` green embed listing that category's commands.
- `/help` with no arg → `runPager({ count: categoryNames().length, render: (i)=>buildCategoryEmbed(commands,i), ownerId })`. `/help <command>` unchanged (restyled via brandEmbed).
Tests: `categoryNames` returns sorted unique categories; `buildCategoryEmbed` lists commands of the chosen category.

---

### Task 4: Confirm destructive actions
**Files:** Create `src/modules/moderation/confirm.js`; Modify `ban.js kick.js unban.js softban.js tempban.js purge.js`; Test `test/modules/moderation/confirm.test.js`.
**Interfaces:** `withConfirm({ interaction, summaryEmbed, onConfirm, awaitFn? }) -> Promise<void>` — replies with `summaryEmbed` + `confirmRow(ownerId)`, awaits owner click; on `confirm:yes` runs `onConfirm()` (which returns a result embed) and edits to it; on cancel/timeout edits to a "Cancelled" embed with disabled buttons.
- Each command: build the pre-action summary embed, wrap the actual action in `onConfirm`.
Tests: injected `awaitFn` returning a yes-click → `onConfirm` called + editReply with result; returning null → `onConfirm` NOT called, "Cancelled" shown.

Implementation of `withConfirm`:
```js
import { confirmRow } from "../../lib/components.js";
import { awaitButton, disableAll } from "../../lib/collect.js";
import { errorEmbed } from "../../lib/embeds.js";

export async function withConfirm({ interaction, summaryEmbed, onConfirm, awaitFn = awaitButton, timeMs = 30000 }) {
  const ownerId = interaction.user.id;
  await interaction.reply({ embeds: [summaryEmbed], components: [confirmRow(ownerId)] });
  const message = await interaction.fetchReply();
  const click = await awaitFn({ message, ownerId, timeMs });
  if (!click || click.customId === `confirm:no:${ownerId}`) {
    const embed = errorEmbed("Cancelled.");
    if (click) await click.update({ embeds: [embed], components: disableAll([confirmRow(ownerId)]) });
    else await interaction.editReply({ embeds: [embed], components: disableAll([confirmRow(ownerId)]) });
    return;
  }
  const result = await onConfirm();
  await click.update({ embeds: [result], components: disableAll([confirmRow(ownerId)]) });
}
```

---

### Task 5: Paginated `/invites leaderboard`
**Files:** Modify `src/modules/invites/commands/invites.js`; Modify `src/modules/invites/InviteService.js` if leaderboard needs a larger fetch; Test extend invites command test.
- Fetch top ~50, `paginate(rows, 10)`, `runPager` over pages rendering a green leaderboard embed with correct global ranks (`page*10 + idx + 1`).
Test: pure `buildLeaderboardEmbed(pageRows, page)` ranks correctly across pages.

---

### Task 6: `/automod panel` toggle exemplar
**Files:** Modify `src/modules/automod/commands/automod.js` (add `panel` subcommand), reuse `src/modules/automod/statusEmbed.js`; Test extend automod command test.
- `panel` → `runToggler`: items = the 6 filters (`{key,label,on}`), `onToggle(key)` maps to the column and flips it via `ctx.config.updateAutomod`, `renderEmbed` = `buildAutomodEmbed(currentConfig)`.
Test: toggler item-building maps filters→columns; toggling a key calls `updateAutomod` with the flipped value.

---

### Task 7: Verify + finish
- Full `npx vitest run`, `npx eslint src test`, loader probe (`node` import of commands — expect 28 commands incl. `tutorial`), boot check.
- Commit, then superpowers:finishing-a-development-branch → merge Plan B to `main`.

## Self-Review
- Covers tutorial (T2), help buttons (T3), confirm-destructive (T4), paginated list (T5), config toggle panel (T6) — all Stage 2 spec items. Navigator loops (T1) are the shared engine. Pure cores tested; collector loops tested with injected `awaitFn`. customId conventions match Stage 1.
