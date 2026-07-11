# Plan A — Green Theme + Component Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the green-forward visual theme and the reusable, unit-tested button/menu primitives that Stages 2 & 3 build on — with no change to any command's behavior yet.

**Architecture:** All new component logic is pure and returns discord.js builders (`ActionRowBuilder`/`ButtonBuilder`/`StringSelectMenuBuilder`) inspected via `.toJSON()` in tests. Interaction wiring is a thin collector wrapper. The top-level interaction router gains a guard so stray/expired component interactions don't fall through to command lookup.

**Tech Stack:** Node.js 25 ESM, discord.js v14, Vitest, ESLint 9 flat config.

## Global Constraints

- Node.js 25, `"type":"module"` (ESM), discord.js v14.
- Bot name `Joint Jagadeesan` (`BOT_NAME`). TDD, one deliverable per task.
- Theme: green-forward — `error` stays red, `warn` stays amber.
- Components model: per-message collectors, owner-gated, timeout-expiring. No global registry.
- Pure builders separated from Discord side-effects; tests use `.toJSON()`, no live gateway.

---

### Task 1: Green palette + emoji constants

**Files:**
- Modify: `src/lib/constants.js`
- Test: `test/lib/constants.test.js`

**Interfaces:**
- Produces: `COLORS = { brand, success, info, muted, warn, error }` (hex numbers);
  `EMOJIS` (string map).

- [ ] **Step 1: Write the failing test**

Create `test/lib/constants.test.js`:

```js
import { describe, it, expect } from "vitest";
import { COLORS, EMOJIS, BOT_NAME } from "../../src/lib/constants.js";

describe("theme constants", () => {
  it("is green-forward but keeps semantic alert colors", () => {
    expect(COLORS.brand).toBe(0x2ecc71);
    expect(COLORS.info).toBe(0x2ecc71); // was blurple → green
    expect(COLORS.success).toBe(0x57f287);
    expect(COLORS.muted).toBe(0x1f8b4c);
    expect(COLORS.error).toBe(0xed4245); // red kept
    expect(COLORS.warn).toBe(0xfee75c); // amber kept
  });
  it("exposes an emoji map and the bot name", () => {
    expect(EMOJIS.success).toBe("✅");
    expect(EMOJIS.on).toBe("🟢");
    expect(EMOJIS.off).toBe("🔴");
    expect(BOT_NAME).toBe("Joint Jagadeesan");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/lib/constants.test.js`
Expected: FAIL (`COLORS.brand` undefined).

- [ ] **Step 3: Update constants.js**

Replace the `COLORS` block and add `EMOJIS` in `src/lib/constants.js`:

```js
export const BOT_NAME = "Joint Jagadeesan";

export const COLORS = {
  brand: 0x2ecc71,
  success: 0x57f287,
  info: 0x2ecc71,
  muted: 0x1f8b4c,
  warn: 0xfee75c,
  error: 0xed4245,
};

export const EMOJIS = {
  success: "✅",
  error: "❌",
  warn: "⚠️",
  info: "ℹ️",
  gear: "⚙️",
  shield: "🛡️",
  mod: "🔨",
  log: "📋",
  invite: "📨",
  wave: "👋",
  star: "⭐",
  book: "📖",
  on: "🟢",
  off: "🔴",
  next: "▶️",
  prev: "◀️",
};

export const LIMITS = {
  embedDescription: 4096,
  embedFieldValue: 1024,
  fieldsPerPage: 6,
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/lib/constants.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.js test/lib/constants.test.js
git commit -m "feat(theme): green-forward palette + emoji constants"
```

---

### Task 2: Restyle embed helpers

**Files:**
- Modify: `src/lib/embeds.js`
- Test: `test/lib/embeds.test.js`

**Interfaces:**
- Consumes: `COLORS`, `BOT_NAME` (Task 1).
- Produces (signatures unchanged so existing callers keep working):
  `successEmbed(text)`, `errorEmbed(text)`, `warnEmbed(text)`, `infoEmbed(title, text)`.
  New: `brandEmbed({ title, description, fields, thumbnail }) -> EmbedBuilder`;
  `panelEmbed` is an alias of `brandEmbed`.

- [ ] **Step 1: Write the failing test**

Create `test/lib/embeds.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  successEmbed,
  errorEmbed,
  warnEmbed,
  infoEmbed,
  brandEmbed,
  panelEmbed,
} from "../../src/lib/embeds.js";
import { COLORS } from "../../src/lib/constants.js";

describe("embed helpers", () => {
  it("success is green with a checkmark and branded footer", () => {
    const e = successEmbed("done").toJSON();
    expect(e.color).toBe(COLORS.success);
    expect(e.description).toContain("done");
    expect(e.footer.text).toBe("Joint Jagadeesan");
    expect(e.timestamp).toBeTruthy();
  });
  it("error stays red", () => {
    expect(errorEmbed("bad").toJSON().color).toBe(COLORS.error);
  });
  it("warn stays amber", () => {
    expect(warnEmbed("hmm").toJSON().color).toBe(COLORS.warn);
  });
  it("info is green with a title", () => {
    const e = infoEmbed("Title", "body").toJSON();
    expect(e.color).toBe(COLORS.info);
    expect(e.title).toBe("Title");
    expect(e.description).toBe("body");
  });
  it("brandEmbed builds a green panel with fields + thumbnail; panelEmbed is an alias", () => {
    const e = brandEmbed({
      title: "Panel",
      description: "desc",
      fields: [{ name: "A", value: "1" }],
      thumbnail: "https://x/y.png",
    }).toJSON();
    expect(e.color).toBe(COLORS.brand);
    expect(e.title).toBe("Panel");
    expect(e.fields[0]).toMatchObject({ name: "A", value: "1" });
    expect(e.thumbnail.url).toBe("https://x/y.png");
    expect(panelEmbed).toBe(brandEmbed);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/lib/embeds.test.js`
Expected: FAIL (`brandEmbed` not exported / no footer).

- [ ] **Step 3: Rewrite embeds.js**

Replace `src/lib/embeds.js`:

```js
import { EmbedBuilder } from "discord.js";
import { COLORS, BOT_NAME, EMOJIS } from "./constants.js";

function base(color) {
  return new EmbedBuilder().setColor(color).setFooter({ text: BOT_NAME }).setTimestamp();
}

export function successEmbed(text) {
  return base(COLORS.success).setDescription(`${EMOJIS.success} ${text}`);
}

export function errorEmbed(text) {
  return base(COLORS.error).setDescription(`${EMOJIS.error} ${text}`);
}

export function warnEmbed(text) {
  return base(COLORS.warn).setDescription(`${EMOJIS.warn} ${text}`);
}

export function infoEmbed(title, text) {
  return base(COLORS.info).setTitle(title).setDescription(text);
}

export function brandEmbed({ title, description, fields, thumbnail } = {}) {
  const e = base(COLORS.brand);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (Array.isArray(fields) && fields.length) e.addFields(fields);
  if (thumbnail) e.setThumbnail(thumbnail);
  return e;
}

export const panelEmbed = brandEmbed;
```

- [ ] **Step 4: Run tests, verify pass (and the whole suite, since embeds are widely used)**

Run: `npx vitest run test/lib/embeds.test.js && npx vitest run`
Expected: `test/lib/embeds.test.js` PASS; full suite still green (existing embed assertions used `toContain`/color and remain valid).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds.js test/lib/embeds.test.js
git commit -m "feat(theme): branded green embeds with footer + timestamp; brandEmbed/panelEmbed"
```

---

### Task 3: Pure component primitives

**Files:**
- Create: `src/lib/components.js`
- Test: `test/lib/components.test.js`

**Interfaces:**
- Produces:
  - `paginate(items, pageSize) -> items[][]` (empty input → `[]`).
  - `pageRow({ page, pageCount, ownerId }) -> ActionRowBuilder` — customIds
    `page:prev:<ownerId>`, `page:ind:<ownerId>` (disabled indicator), `page:next:<ownerId>`.
  - `confirmRow(ownerId) -> ActionRowBuilder` — `confirm:yes:<ownerId>` (Danger),
    `confirm:no:<ownerId>` (Secondary).
  - `toggleRow(items) -> ActionRowBuilder[]` — `items:{key,label,on}[]`, customId
    `toggle:<key>:<ownerId>` — **note:** `toggleRow(items, ownerId)`.
  - `ownerFilter(interaction, ownerId) -> boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/lib/components.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  paginate,
  pageRow,
  confirmRow,
  toggleRow,
  ownerFilter,
} from "../../src/lib/components.js";

describe("paginate", () => {
  it("chunks items into pages", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns [] for empty input", () => {
    expect(paginate([], 5)).toEqual([]);
  });
});

describe("pageRow", () => {
  it("disables prev on the first page and next on the last", () => {
    const first = pageRow({ page: 0, pageCount: 3, ownerId: "u1" }).toJSON();
    const [prev, ind, next] = first.components;
    expect(prev.custom_id).toBe("page:prev:u1");
    expect(prev.disabled).toBe(true);
    expect(ind.disabled).toBe(true);
    expect(ind.label).toBe("1/3");
    expect(next.disabled).toBe(false);
    const last = pageRow({ page: 2, pageCount: 3, ownerId: "u1" }).toJSON();
    expect(last.components[2].disabled).toBe(true); // next disabled on last
  });
});

describe("confirmRow", () => {
  it("builds Confirm (danger) / Cancel with owner-scoped ids", () => {
    const r = confirmRow("u1").toJSON();
    expect(r.components[0].custom_id).toBe("confirm:yes:u1");
    expect(r.components[0].style).toBe(4); // Danger
    expect(r.components[1].custom_id).toBe("confirm:no:u1");
  });
});

describe("toggleRow", () => {
  it("renders one button per item, green when on, chunked ≤5/row", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      label: `L${i}`,
      on: i % 2 === 0,
    }));
    const rows = toggleRow(items, "u1");
    expect(rows.length).toBe(2); // 6 items → 5 + 1
    const first = rows[0].toJSON();
    expect(first.components[0].custom_id).toBe("toggle:k0:u1");
    expect(first.components[0].style).toBe(3); // Success (on)
    expect(first.components[1].style).toBe(2); // Secondary (off)
  });
});

describe("ownerFilter", () => {
  it("passes only the owner", () => {
    expect(ownerFilter({ user: { id: "u1" } }, "u1")).toBe(true);
    expect(ownerFilter({ user: { id: "u2" } }, "u1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/lib/components.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement components.js**

Create `src/lib/components.js`:

```js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { EMOJIS } from "./constants.js";

export function paginate(items, pageSize) {
  const pages = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

export function pageRow({ page, pageCount, ownerId }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page:prev:${ownerId}`)
      .setLabel("Prev")
      .setEmoji(EMOJIS.prev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`page:ind:${ownerId}`)
      .setLabel(`${page + 1}/${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page:next:${ownerId}`)
      .setLabel("Next")
      .setEmoji(EMOJIS.next)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount - 1),
  );
}

export function confirmRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm:yes:${ownerId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`confirm:no:${ownerId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function toggleRow(items, ownerId) {
  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((it) =>
          new ButtonBuilder()
            .setCustomId(`toggle:${it.key}:${ownerId}`)
            .setLabel(`${it.on ? EMOJIS.on : EMOJIS.off} ${it.label}`)
            .setStyle(it.on ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
      ),
    );
  }
  return rows;
}

export function ownerFilter(interaction, ownerId) {
  return interaction.user?.id === ownerId;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/lib/components.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components.js test/lib/components.test.js
git commit -m "feat(components): pure paginate/pageRow/confirmRow/toggleRow/ownerFilter primitives"
```

---

### Task 4: Collector wrapper

**Files:**
- Create: `src/lib/collect.js`
- Test: `test/lib/collect.test.js`

**Interfaces:**
- Consumes: `ownerFilter` (Task 3).
- Produces:
  - `awaitButton({ message, ownerId, timeMs }) -> Promise<interaction|null>` — resolves the first
    owner button click, or `null` on timeout (swallows the collector rejection).
  - `disableAll(rows) -> rows` — mutates each `ActionRowBuilder`'s buttons to `disabled:true`,
    returns the rows (for post-timeout cleanup).

- [ ] **Step 1: Write the failing test**

Create `test/lib/collect.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { awaitButton, disableAll } from "../../src/lib/collect.js";
import { confirmRow } from "../../src/lib/components.js";

describe("awaitButton", () => {
  it("resolves the awaited component interaction", async () => {
    const fakeInteraction = { user: { id: "u1" }, customId: "confirm:yes:u1" };
    const message = { awaitMessageComponent: vi.fn(async () => fakeInteraction) };
    const out = await awaitButton({ message, ownerId: "u1", timeMs: 50 });
    expect(out).toBe(fakeInteraction);
    // the filter passed to discord.js only allows the owner
    const { filter } = message.awaitMessageComponent.mock.calls[0][0];
    expect(filter({ user: { id: "u1" } })).toBe(true);
    expect(filter({ user: { id: "u2" } })).toBe(false);
  });
  it("returns null on timeout (rejection swallowed)", async () => {
    const message = { awaitMessageComponent: vi.fn(async () => Promise.reject(new Error("time"))) };
    expect(await awaitButton({ message, ownerId: "u1", timeMs: 10 })).toBeNull();
  });
});

describe("disableAll", () => {
  it("disables every button in the given rows", () => {
    const rows = [confirmRow("u1")];
    const out = disableAll(rows);
    const json = out[0].toJSON();
    expect(json.components.every((c) => c.disabled === true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/lib/collect.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement collect.js**

Create `src/lib/collect.js`:

```js
import { ComponentType } from "discord.js";
import { ownerFilter } from "./components.js";

export async function awaitButton({ message, ownerId, timeMs = 120000 }) {
  try {
    return await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: timeMs,
      filter: (i) => ownerFilter(i, ownerId),
    });
  } catch {
    return null; // timeout / no interaction
  }
}

export function disableAll(rows) {
  for (const row of rows) {
    for (const comp of row.components) {
      if (typeof comp.setDisabled === "function") comp.setDisabled(true);
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/lib/collect.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/collect.js test/lib/collect.test.js
git commit -m "feat(components): awaitButton collector wrapper + disableAll cleanup"
```

---

### Task 5: Interaction router guard

**Files:**
- Modify: `src/modules/util/events/interactionCreate.js`
- Test: `test/modules/util/interactionRouter.test.js` (create if absent; otherwise extend the
  existing router test)

**Interfaces:**
- Consumes: nothing new. Produces: router that early-returns for component interactions so
  stray/expired buttons never reach command lookup.

- [ ] **Step 1: Write the failing test**

Create `test/modules/util/interactionRouter.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/util/events/interactionCreate.js";

function ctx() {
  return {
    commands: { get: vi.fn(() => undefined) },
    config: { getGuild: vi.fn() },
    cooldowns: { check: vi.fn(() => ({ limited: false })) },
    logger: { error: vi.fn() },
  };
}

describe("interaction router component guard", () => {
  it("ignores button interactions without touching command lookup", async () => {
    const c = ctx();
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
    };
    await listener.execute(c, interaction);
    expect(c.commands.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/util/interactionRouter.test.js`
Expected: FAIL — the current router calls `isChatInputCommand()` then returns, but `commands.get`
is not called for a button anyway; the test may already pass. If it PASSES, still add the explicit
guard in Step 3 for clarity and to protect select menus. If it FAILS, Step 3 fixes it.

- [ ] **Step 3: Add the guard**

In `src/modules/util/events/interactionCreate.js`, after the autocomplete block and before
`if (!interaction.isChatInputCommand()) return;`, add:

```js
    // Component interactions (buttons / select menus) are handled by per-message
    // collectors inside each command, never by the global router. Ignore strays.
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) return;
```

- [ ] **Step 4: Run tests, verify pass (and the existing router tests)**

Run: `npx vitest run test/modules/util/`
Expected: PASS.

- [ ] **Step 5: Full suite + lint + boot check**

Run:
```bash
npx vitest run
npx eslint src test
node -e 'import("dotenv/config").then(async()=>{const {Client,GatewayIntentBits}=await import("discord.js");const c=new Client({intents:[GatewayIntentBits.Guilds]});c.once("ready",x=>{console.log("BOOT OK",x.user.tag);c.destroy();process.exit(0)});c.login(process.env.DISCORD_TOKEN).catch(e=>{console.log("login:",e.message);process.exit(1)});setTimeout(()=>process.exit(1),20000)});'
```
Expected: all tests PASS, eslint clean, `BOOT OK Joint Jagadeesan#2681`.

- [ ] **Step 6: Commit + finish branch**

```bash
git add src/modules/util/events/interactionCreate.js test/modules/util/interactionRouter.test.js
git commit -m "feat(router): ignore stray component interactions at the top-level router"
```
Then use superpowers:finishing-a-development-branch to merge Plan A to `main`.

---

## Self-Review

- **Spec coverage:** palette (Task 1) ✓; restyled embeds + brandEmbed/panelEmbed (Task 2) ✓;
  paginate/pageRow/confirmRow/toggleRow/ownerFilter (Task 3) ✓; collector wrapper + disableAll
  (Task 4) ✓; router guard (Task 5) ✓. Stage 1 fully covered; no command behavior changes (correct
  for this stage).
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `toggleRow(items, ownerId)` signature is consistent between its Interfaces
  block, the implementation, and the test; customId conventions (`page:*`, `confirm:*`, `toggle:*`)
  are identical across Tasks 3–5; `COLORS`/`EMOJIS` keys match between Tasks 1 and 2.
