# Phase 2b — Auto-Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-moderate messages — anti-spam, anti-mention-spam, invite/link filtering, mass-caps, and emoji spam — with per-guild config, exemptions, and a configurable action (delete / warn / timeout), all wired to `/automod`.

**Architecture:** Pure filter functions decide whether a message trips a rule; a per-shard `AutomodState` tracks message rate for spam. On `messageCreate`, the listener loads cached per-guild `AutomodConfig`, checks exemptions, runs `evaluateMessage`, and on a trip runs `applyAutomodAction` (delete + optional warn/timeout case). Every filter and the evaluation/exemption/action logic is pure or dependency-injected and unit-tested.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`Events`, `SlashCommandBuilder`, `PermissionFlagsBits`), Prisma (`AutomodConfig`), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse:** `WindowTracker` (`src/modules/antinuke/WindowTracker.js`), `ConfigService`, `CaseService` (`ctx.cases`), `successEmbed`/`errorEmbed`, `COLORS`, `PermissionFlagsBits`. Do NOT re-implement.
- **All new code under `src/modules/automod/`**; the `messageCreate` listener is auto-discovered.
- **Intents:** the `messageCreate` event needs `GuildMessages` (already enabled). The **content-based filters** (invites/links, caps, emoji) additionally need the privileged **MessageContent** intent — added in Task 7. Without it, `message.content` is empty and those filters simply never trip. Spam and mention-spam do NOT need MessageContent (`message.mentions` is delivered regardless).
- **Exemptions:** users with **Manage Messages**, configured exempt roles, and configured exempt channels are never auto-moderated. Bots are ignored.
- **First trip wins:** `evaluateMessage` returns on the first rule that trips.
- **Never throw out of the listener;** delete/timeout failures are caught and logged.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (`feat(automod): ...`).

---

### Task 1: Schema + `ConfigService.updateAutomod`

**Files:**
- Modify: `prisma/schema.prisma` (add `AutomodConfig`, relation on `Guild`)
- Modify: `prisma/migrations/manual_init.sql` (regenerate)
- Modify: `src/core/ConfigService.js` (add `automod` to `INCLUDE`; add `updateAutomod`)
- Test: `test/core/ConfigService.automod.test.js`

**Interfaces:**
- Consumes: injected Prisma-like client (`automodConfig.upsert`).
- Produces: `ConfigService.updateAutomod(guildId, data): row` — ensures the guild row exists, upserts `AutomodConfig`, invalidates cache. `getGuild` now includes `automod`.

- [ ] **Step 1: Add the model + relation to `prisma/schema.prisma`**

Add `automod AutomodConfig?` to the `Guild` model's relations (next to `antinuke`):

```prisma
  antinuke      AntinukeConfig?
  automod       AutomodConfig?
  logging       LoggingConfig?
```

Append the model at the end of the file:

```prisma
model AutomodConfig {
  guildId         String  @id
  guild           Guild   @relation(fields: [guildId], references: [id], onDelete: Cascade)
  enabled         Boolean @default(false)
  antiSpam        Boolean @default(true)
  spamCount       Int     @default(5)
  spamWindowSec   Int     @default(5)
  antiMentionSpam Boolean @default(true)
  mentionLimit    Int     @default(5)
  filterInvites   Boolean @default(true)
  filterLinks     Boolean @default(false)
  antiCaps        Boolean @default(false)
  capsPercent     Int     @default(70)
  capsMinLength   Int     @default(10)
  antiEmojiSpam   Boolean @default(false)
  emojiLimit      Int     @default(8)
  action          String  @default("delete") // delete | warn | timeout
  timeoutSeconds  Int     @default(300)
  exemptRoles     Json    @default("[]")
  exemptChannels  Json    @default("[]")
}
```

- [ ] **Step 2: Regenerate the Prisma client and offline SQL**

Run:
```bash
npx prisma generate && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual_init.sql
```
Expected: client regenerated; `manual_init.sql` includes the `AutomodConfig` table.

- [ ] **Step 3: Write the failing test `test/core/ConfigService.automod.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", antinuke: null, automod: null, logging: null, modRoles: [], whitelist: [] })),
      create: vi.fn(async ({ data }) => ({ ...data })),
    },
    automodConfig: {
      upsert: vi.fn(async ({ where, create, update }) => ({ guildId: where.guildId, ...create, ...update })),
    },
  };
}

describe("ConfigService.updateAutomod", () => {
  it("upserts automod config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    const row = await svc.updateAutomod("g1", { enabled: true, action: "timeout" });
    expect(row.enabled).toBe(true);
    expect(prisma.automodConfig.upsert).toHaveBeenCalled();
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2); // cache invalidated
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run test/core/ConfigService.automod.test.js`
Expected: FAIL — `updateAutomod is not a function`.

- [ ] **Step 5: Modify `src/core/ConfigService.js`**

Change `INCLUDE` to add `automod: true`:

```js
const INCLUDE = { antinuke: true, automod: true, logging: true, modRoles: true, whitelist: true };
```

Add the method (next to `updateAntinuke`):

```js
  async updateAutomod(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.automodConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }
```

- [ ] **Step 6: Run to verify it passes (and existing ConfigService tests still pass)**

Run: `npx vitest run test/core/ConfigService.automod.test.js test/core/ConfigService.test.js`
Expected: PASS — both green.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/manual_init.sql src/core/ConfigService.js test/core/ConfigService.automod.test.js
git commit -m "feat(automod): add automod config schema and persistence"
```

---

### Task 2: Filter functions (`src/modules/automod/filters.js`)

**Files:**
- Create: `src/modules/automod/filters.js`
- Test: `test/modules/automod/filters.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `countMentions(message): number` — `message.mentions.users.size + message.mentions.roles.size`.
  - `hasInvite(content): boolean`, `hasLink(content): boolean`.
  - `capsRatio(content): number` (0–1 over alphabetic chars), `isCapsSpam(content, { minLength, percent }): boolean`.
  - `countEmoji(content): number` (custom `<:x:1>` + unicode pictographic), `isEmojiSpam(content, limit): boolean`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import {
  countMentions,
  hasInvite,
  hasLink,
  isCapsSpam,
  countEmoji,
  isEmojiSpam,
} from "../../../src/modules/automod/filters.js";

describe("countMentions", () => {
  it("sums user and role mentions", () => {
    const message = { mentions: { users: new Map([["a", 1], ["b", 1]]), roles: new Map([["r", 1]]) } };
    expect(countMentions(message)).toBe(3);
  });
});

describe("link/invite filters", () => {
  it("detects discord invites", () => {
    expect(hasInvite("join discord.gg/abcd")).toBe(true);
    expect(hasInvite("nothing here")).toBe(false);
  });
  it("detects external links", () => {
    expect(hasLink("see https://example.com")).toBe(true);
    expect(hasLink("no link")).toBe(false);
  });
});

describe("caps filter", () => {
  it("trips on mostly-uppercase long messages", () => {
    expect(isCapsSpam("STOP YELLING AT ME", { minLength: 8, percent: 70 })).toBe(true);
  });
  it("ignores short messages", () => {
    expect(isCapsSpam("HI", { minLength: 8, percent: 70 })).toBe(false);
  });
  it("ignores normal-case messages", () => {
    expect(isCapsSpam("this is a normal sentence", { minLength: 8, percent: 70 })).toBe(false);
  });
});

describe("emoji filter", () => {
  it("counts custom and unicode emoji", () => {
    expect(countEmoji("hi <:smile:1> 😀 😀")).toBe(3);
  });
  it("trips over the limit", () => {
    expect(isEmojiSpam("😀😀😀😀😀", 4)).toBe(true);
    expect(isEmojiSpam("😀", 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/automod/filters.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/automod/filters.js`**

```js
const INVITE_RE = /(discord\.(gg|io|me)|discord(app)?\.com\/invite)\/\S+/i;
const URL_RE = /https?:\/\/\S+/i;
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g;
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function countMentions(message) {
  const users = message.mentions?.users?.size ?? 0;
  const roles = message.mentions?.roles?.size ?? 0;
  return users + roles;
}

export function hasInvite(content) {
  return INVITE_RE.test(content ?? "");
}

export function hasLink(content) {
  return URL_RE.test(content ?? "");
}

export function capsRatio(content) {
  const letters = (content ?? "").replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

export function isCapsSpam(content, { minLength, percent }) {
  const c = content ?? "";
  if (c.length < minLength) return false;
  return capsRatio(c) * 100 >= percent;
}

export function countEmoji(content) {
  const c = content ?? "";
  const custom = (c.match(CUSTOM_EMOJI_RE) ?? []).length;
  const unicode = (c.match(UNICODE_EMOJI_RE) ?? []).length;
  return custom + unicode;
}

export function isEmojiSpam(content, limit) {
  return countEmoji(content) >= limit;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/automod/filters.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/automod/filters.js test/modules/automod/filters.test.js
git commit -m "feat(automod): add message filter functions"
```

---

### Task 3: `AutomodState` (message-rate tracker)

**Files:**
- Create: `src/modules/automod/AutomodState.js`
- Test: `test/modules/automod/AutomodState.test.js`

**Interfaces:**
- Consumes: `WindowTracker` (`src/modules/antinuke/WindowTracker.js`).
- Produces: class `AutomodState` — `constructor(now = () => Date.now())`; `recordMessage(guildId, userId, windowMs): number`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { AutomodState } from "../../../src/modules/automod/AutomodState.js";

describe("AutomodState", () => {
  it("counts a user's messages within the window", () => {
    const s = new AutomodState(() => 1000);
    expect(s.recordMessage("g1", "u1", 5000)).toBe(1);
    expect(s.recordMessage("g1", "u1", 5000)).toBe(2);
    expect(s.recordMessage("g1", "u2", 5000)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/automod/AutomodState.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/automod/AutomodState.js`**

```js
import { WindowTracker } from "../antinuke/WindowTracker.js";

export class AutomodState {
  constructor(now = () => Date.now()) {
    this.messages = new WindowTracker(now);
  }

  recordMessage(guildId, userId, windowMs) {
    return this.messages.record(`${guildId}:${userId}`, windowMs);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/automod/AutomodState.test.js`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/automod/AutomodState.js test/modules/automod/AutomodState.test.js
git commit -m "feat(automod): add per-user message-rate tracker"
```

---

### Task 4: Evaluation, exemption, and action

**Files:**
- Create: `src/modules/automod/evaluate.js`
- Create: `src/modules/automod/action.js`
- Test: `test/modules/automod/evaluate.test.js`
- Test: `test/modules/automod/action.test.js`

**Interfaces:**
- Consumes: filters (T2), `PermissionFlagsBits`, `ctx.cases`.
- Produces:
  - `evaluateMessage({ message, config, spamCount }): { tripped, reason? }` — first-trip-wins across enabled rules.
  - `isExempt({ member, channelId, config }): boolean`.
  - `async applyAutomodAction({ message, member, config, reason, cases, logger }): void` — deletes the message; on `action==="warn"`/`"timeout"` also records a case (and times out the member for `timeout`).

- [ ] **Step 1: Write the failing test `test/modules/automod/evaluate.test.js`**

```js
import { describe, it, expect } from "vitest";
import { evaluateMessage, isExempt } from "../../../src/modules/automod/evaluate.js";
import { PermissionFlagsBits } from "discord.js";

const baseConfig = {
  antiSpam: true, spamCount: 5,
  antiMentionSpam: true, mentionLimit: 5,
  filterInvites: true, filterLinks: false,
  antiCaps: true, capsPercent: 70, capsMinLength: 8,
  antiEmojiSpam: true, emojiLimit: 4,
};
const msg = (over = {}) => ({ content: "", mentions: { users: new Map(), roles: new Map() }, ...over });

describe("evaluateMessage", () => {
  it("trips on spam when count reaches the limit", () => {
    expect(evaluateMessage({ message: msg(), config: baseConfig, spamCount: 5 }).reason).toBe("spam");
  });
  it("trips on an invite link", () => {
    const r = evaluateMessage({ message: msg({ content: "discord.gg/xyz" }), config: baseConfig, spamCount: 0 });
    expect(r.tripped).toBe(true);
    expect(r.reason).toMatch(/invite/);
  });
  it("does not trip a clean message", () => {
    expect(evaluateMessage({ message: msg({ content: "hello there" }), config: baseConfig, spamCount: 1 }).tripped).toBe(false);
  });
  it("respects disabled rules", () => {
    const cfg = { ...baseConfig, filterInvites: false };
    expect(evaluateMessage({ message: msg({ content: "discord.gg/xyz" }), config: cfg, spamCount: 0 }).tripped).toBe(false);
  });
});

describe("isExempt", () => {
  const member = (perms = [], roleIds = []) => ({
    permissions: { has: (p) => perms.includes(p) },
    roles: { cache: new Map(roleIds.map((r) => [r, { id: r }])) },
  });
  it("exempts Manage Messages holders", () => {
    expect(isExempt({ member: member([PermissionFlagsBits.ManageMessages]), channelId: "c1", config: {} })).toBe(true);
  });
  it("exempts configured roles and channels", () => {
    expect(isExempt({ member: member([], ["r1"]), channelId: "c1", config: { exemptRoles: ["r1"] } })).toBe(true);
    expect(isExempt({ member: member(), channelId: "c1", config: { exemptChannels: ["c1"] } })).toBe(true);
  });
  it("does not exempt a normal member", () => {
    expect(isExempt({ member: member(), channelId: "c9", config: { exemptRoles: [], exemptChannels: [] } })).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing test `test/modules/automod/action.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { applyAutomodAction } from "../../../src/modules/automod/action.js";

function message() {
  return {
    delete: vi.fn(async () => {}),
    guild: { id: "g1" },
    client: { user: { id: "bot" } },
  };
}
const logger = { error: vi.fn() };

describe("applyAutomodAction", () => {
  it("deletes on the default action", async () => {
    const m = message();
    const cases = { createCase: vi.fn() };
    await applyAutomodAction({ message: m, member: { id: "u1" }, config: { action: "delete" }, reason: "spam", cases, logger });
    expect(m.delete).toHaveBeenCalled();
    expect(cases.createCase).not.toHaveBeenCalled();
  });

  it("deletes and warns on the warn action", async () => {
    const m = message();
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({ message: m, member: { id: "u1" }, config: { action: "warn" }, reason: "invite", cases, logger });
    expect(m.delete).toHaveBeenCalled();
    expect(cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "warn" }));
  });

  it("deletes, times out, and records a case on the timeout action", async () => {
    const m = message();
    const member = { id: "u1", timeout: vi.fn(async () => {}) };
    const cases = { createCase: vi.fn(async () => ({})) };
    await applyAutomodAction({ message: m, member, config: { action: "timeout", timeoutSeconds: 300 }, reason: "caps", cases, logger });
    expect(member.timeout).toHaveBeenCalledWith(300000, expect.any(String));
    expect(cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/modules/automod/evaluate.test.js test/modules/automod/action.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `src/modules/automod/evaluate.js`**

```js
import { PermissionFlagsBits } from "discord.js";
import {
  countMentions,
  hasInvite,
  hasLink,
  isCapsSpam,
  isEmojiSpam,
} from "./filters.js";

export function evaluateMessage({ message, config, spamCount }) {
  if (config.antiSpam && spamCount >= config.spamCount) return { tripped: true, reason: "spam" };
  if (config.antiMentionSpam && countMentions(message) >= config.mentionLimit)
    return { tripped: true, reason: "mention spam" };
  if (config.filterInvites && hasInvite(message.content))
    return { tripped: true, reason: "invite link" };
  if (config.filterLinks && hasLink(message.content))
    return { tripped: true, reason: "external link" };
  if (
    config.antiCaps &&
    isCapsSpam(message.content, { minLength: config.capsMinLength, percent: config.capsPercent })
  )
    return { tripped: true, reason: "excessive caps" };
  if (config.antiEmojiSpam && isEmojiSpam(message.content, config.emojiLimit))
    return { tripped: true, reason: "emoji spam" };
  return { tripped: false };
}

export function isExempt({ member, channelId, config }) {
  if (member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  const exemptRoles = config.exemptRoles ?? [];
  if (member && exemptRoles.some((r) => member.roles.cache.has(r))) return true;
  if ((config.exemptChannels ?? []).includes(channelId)) return true;
  return false;
}
```

- [ ] **Step 5: Write `src/modules/automod/action.js`**

```js
export async function applyAutomodAction({ message, member, config, reason, cases, logger }) {
  try {
    await message.delete();
  } catch (err) {
    logger.error({ err }, "automod delete failed");
  }

  const botId = message.client.user.id;
  if (config.action === "warn" && member) {
    await cases.createCase({
      guildId: message.guild.id,
      type: "warn",
      targetId: member.id,
      moderatorId: botId,
      reason: `AutoMod: ${reason}`,
    });
  } else if (config.action === "timeout" && member) {
    try {
      await member.timeout(config.timeoutSeconds * 1000, `AutoMod: ${reason}`);
    } catch (err) {
      logger.error({ err }, "automod timeout failed");
    }
    await cases.createCase({
      guildId: message.guild.id,
      type: "timeout",
      targetId: member.id,
      moderatorId: botId,
      reason: `AutoMod: ${reason}`,
      expiresAt: new Date(Date.now() + config.timeoutSeconds * 1000),
    });
  }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run test/modules/automod/evaluate.test.js test/modules/automod/action.test.js`
Expected: PASS — 7 + 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/automod/evaluate.js src/modules/automod/action.js test/modules/automod/evaluate.test.js test/modules/automod/action.test.js
git commit -m "feat(automod): add message evaluation, exemptions, and actions"
```

---

### Task 5: `messageCreate` listener

**Files:**
- Create: `src/modules/automod/events/messageCreate.js`
- Test: `test/modules/automod/messageCreate.test.js`

**Interfaces:**
- Consumes: `evaluateMessage`/`isExempt` (T4), `applyAutomodAction` (T4), `AutomodState` (T3), `ctx.config`, `ctx.cases`, `Events`.
- Produces: default-export listener `{ name: Events.MessageCreate, execute(ctx, message) }` — ignores bot/DM/disabled/exempt, records the message rate, evaluates, and acts on a trip.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import listener from "../../../src/modules/automod/events/messageCreate.js";
import { AutomodState } from "../../../src/modules/automod/AutomodState.js";

function ctx(config) {
  return {
    config: { getGuild: vi.fn(async () => ({ automod: config })) },
    cases: { createCase: vi.fn(async () => ({})) },
    automod: new AutomodState(() => 1000),
    logger: { error: vi.fn() },
  };
}

function message(over = {}) {
  return {
    guild: { id: "g1" },
    channelId: "c1",
    author: { id: "u1", bot: false },
    content: "",
    mentions: { users: new Map(), roles: new Map() },
    member: { permissions: { has: () => false }, roles: { cache: new Map() } },
    delete: vi.fn(async () => {}),
    client: { user: { id: "bot" } },
    ...over,
  };
}

const enabledConfig = {
  enabled: true, antiSpam: true, spamCount: 3, spamWindowSec: 5,
  antiMentionSpam: true, mentionLimit: 5, filterInvites: true, filterLinks: false,
  antiCaps: false, antiEmojiSpam: false, action: "delete",
  exemptRoles: [], exemptChannels: [],
};

describe("automod messageCreate", () => {
  it("ignores bots", async () => {
    const c = ctx(enabledConfig);
    const m = message({ author: { id: "b", bot: true } });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("does nothing when automod is disabled", async () => {
    const c = ctx({ ...enabledConfig, enabled: false });
    const m = message({ content: "discord.gg/x" });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("deletes an invite-link message", async () => {
    const c = ctx(enabledConfig);
    const m = message({ content: "join discord.gg/xyz" });
    await listener.execute(c, m);
    expect(m.delete).toHaveBeenCalled();
  });

  it("deletes on spam after the threshold", async () => {
    const c = ctx(enabledConfig);
    let m;
    for (let i = 0; i < 3; i++) {
      m = message();
      await listener.execute(c, m);
    }
    expect(m.delete).toHaveBeenCalled(); // 3rd message trips spamCount=3
  });

  it("skips exempt members", async () => {
    const c = ctx(enabledConfig);
    const m = message({ content: "discord.gg/xyz", member: { permissions: { has: () => true }, roles: { cache: new Map() } } });
    await listener.execute(c, m);
    expect(m.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/automod/messageCreate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/automod/events/messageCreate.js`**

```js
import { Events } from "discord.js";
import { evaluateMessage, isExempt } from "../evaluate.js";
import { applyAutomodAction } from "../action.js";

export default {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || message.author?.bot) return;

    const guildConfig = await ctx.config.getGuild(message.guild.id);
    const config = guildConfig.automod;
    if (!config?.enabled) return;

    const member = message.member;
    if (isExempt({ member, channelId: message.channelId, config })) return;

    const spamCount = ctx.automod.recordMessage(
      message.guild.id,
      message.author.id,
      config.spamWindowSec * 1000,
    );
    const result = evaluateMessage({ message, config, spamCount });
    if (!result.tripped) return;

    await applyAutomodAction({
      message,
      member,
      config,
      reason: result.reason,
      cases: ctx.cases,
      logger: ctx.logger,
    });
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/automod/messageCreate.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/automod/events/messageCreate.js test/modules/automod/messageCreate.test.js
git commit -m "feat(automod): add message-create moderation listener"
```

---

### Task 6: `/automod` command

**Files:**
- Create: `src/modules/automod/statusEmbed.js`
- Create: `src/modules/automod/commands/automod.js`
- Test: `test/modules/automod/automodCommand.test.js`

**Interfaces:**
- Consumes: `ConfigService` (`updateAutomod`/`getGuild`); `successEmbed`; `PermissionFlagsBits`.
- Produces:
  - `buildAutomodEmbed(automodConfig): EmbedBuilder`.
  - default-export command with subcommands: `enable`, `disable`, `view`, `action` (`type: delete|warn|timeout`), `filter` (`name` choice, `state: on|off`), `exempt` (`action: add|remove`, `role`? / `channel`?).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/automod/commands/automod.js";
import { buildAutomodEmbed } from "../../../src/modules/automod/statusEmbed.js";

function ctx(automod = { enabled: true, action: "delete", exemptRoles: [], exemptChannels: [] }) {
  return {
    config: {
      updateAutomod: vi.fn(async () => ({})),
      getGuild: vi.fn(async () => ({ automod })),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
      getChannel: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/automod", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("automod");
    expect(command.permissions.length).toBe(1);
  });
  it("enable turns it on", async () => {
    const c = ctx();
    await command.execute(interaction("enable"), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { enabled: true });
  });
  it("action sets the punishment", async () => {
    const c = ctx();
    await command.execute(interaction("action", { type: "timeout" }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { action: "timeout" });
  });
  it("filter toggles a named filter to the mapped column", async () => {
    const c = ctx();
    await command.execute(interaction("filter", { name: "invites", state: "off" }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { filterInvites: false });
  });
  it("exempt add stores a role in the exempt list", async () => {
    const c = ctx({ enabled: true, action: "delete", exemptRoles: [], exemptChannels: [] });
    await command.execute(interaction("exempt", { action: "add", role: { id: "r1" } }), c);
    expect(c.config.updateAutomod).toHaveBeenCalledWith("g1", { exemptRoles: ["r1"] });
  });
  it("view replies with an embed", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("buildAutomodEmbed", () => {
  it("summarizes config", () => {
    const e = buildAutomodEmbed({ enabled: true, action: "timeout", antiSpam: true, filterInvites: true });
    expect(JSON.stringify(e.data)).toContain("timeout");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/automod/automodCommand.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/automod/statusEmbed.js`**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

export function buildAutomodEmbed(config = {}) {
  const on = (v) => (v ? "✅" : "❌");
  return new EmbedBuilder()
    .setColor(config.enabled ? COLORS.success : COLORS.warn)
    .setTitle("🤖 Auto-Moderation")
    .addFields(
      { name: "Enabled", value: config.enabled ? "✅ Yes" : "❌ No", inline: true },
      { name: "Action", value: `\`${config.action ?? "delete"}\``, inline: true },
      {
        name: "Filters",
        value:
          `${on(config.antiSpam)} spam  ${on(config.antiMentionSpam)} mentions  ` +
          `${on(config.filterInvites)} invites  ${on(config.filterLinks)} links  ` +
          `${on(config.antiCaps)} caps  ${on(config.antiEmojiSpam)} emoji`,
      },
    );
}
```

- [ ] **Step 4: Write `src/modules/automod/commands/automod.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";
import { buildAutomodEmbed } from "../statusEmbed.js";

const FILTER_COLUMN = {
  spam: "antiSpam",
  mentions: "antiMentionSpam",
  invites: "filterInvites",
  links: "filterLinks",
  caps: "antiCaps",
  emoji: "antiEmojiSpam",
};

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure auto-moderation.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable auto-moderation."))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable auto-moderation."))
    .addSubcommand((s) => s.setName("view").setDescription("Show auto-moderation settings."))
    .addSubcommand((s) =>
      s
        .setName("action")
        .setDescription("What to do when a filter trips.")
        .addStringOption((o) =>
          o.setName("type").setDescription("Action").setRequired(true).addChoices(
            { name: "delete", value: "delete" },
            { name: "warn", value: "warn" },
            { name: "timeout", value: "timeout" },
          ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("filter")
        .setDescription("Toggle an individual filter.")
        .addStringOption((o) =>
          o.setName("name").setDescription("Filter").setRequired(true).addChoices(
            { name: "spam", value: "spam" },
            { name: "mentions", value: "mentions" },
            { name: "invites", value: "invites" },
            { name: "links", value: "links" },
            { name: "caps", value: "caps" },
            { name: "emoji", value: "emoji" },
          ),
        )
        .addStringOption((o) =>
          o.setName("state").setDescription("on or off").setRequired(true).addChoices(
            { name: "on", value: "on" },
            { name: "off", value: "off" },
          ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("exempt")
        .setDescription("Add or remove an exempt role or channel.")
        .addStringOption((o) =>
          o.setName("action").setDescription("add or remove").setRequired(true).addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" },
          ),
        )
        .addRoleOption((o) => o.setName("role").setDescription("Exempt role"))
        .addChannelOption((o) => o.setName("channel").setDescription("Exempt channel")),
    ),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "enable") {
      await ctx.config.updateAutomod(guildId, { enabled: true });
      await interaction.reply({ embeds: [successEmbed("Auto-moderation **enabled**.")] });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateAutomod(guildId, { enabled: false });
      await interaction.reply({ embeds: [successEmbed("Auto-moderation **disabled**.")] });
      return;
    }
    if (sub === "action") {
      const type = interaction.options.getString("type");
      await ctx.config.updateAutomod(guildId, { action: type });
      await interaction.reply({ embeds: [successEmbed(`Action set to \`${type}\`.`)] });
      return;
    }
    if (sub === "filter") {
      const name = interaction.options.getString("name");
      const on = interaction.options.getString("state") === "on";
      await ctx.config.updateAutomod(guildId, { [FILTER_COLUMN[name]]: on });
      await interaction.reply({ embeds: [successEmbed(`Filter \`${name}\` **${on ? "on" : "off"}**.`)] });
      return;
    }
    if (sub === "exempt") {
      const action = interaction.options.getString("action");
      const role = interaction.options.getRole("role");
      const channel = interaction.options.getChannel("channel");
      const target = role ?? channel;
      if (!target) {
        await interaction.reply({ embeds: [errorEmbed("Provide a role or a channel.")], ephemeral: true });
        return;
      }
      const guildConfig = await ctx.config.getGuild(guildId);
      const key = role ? "exemptRoles" : "exemptChannels";
      const current = new Set(guildConfig.automod?.[key] ?? []);
      if (action === "add") current.add(target.id);
      else current.delete(target.id);
      await ctx.config.updateAutomod(guildId, { [key]: [...current] });
      await interaction.reply({ embeds: [successEmbed(`Exempt ${role ? "role" : "channel"} ${action === "add" ? "added" : "removed"}.`)] });
      return;
    }
    if (sub === "view") {
      const guildConfig = await ctx.config.getGuild(guildId);
      await interaction.reply({ embeds: [buildAutomodEmbed(guildConfig.automod ?? {})] });
    }
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/automod/automodCommand.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/automod/statusEmbed.js src/modules/automod/commands/automod.js test/modules/automod/automodCommand.test.js
git commit -m "feat(automod): add /automod configuration command"
```

---

### Task 7: Wiring (state + MessageContent intent) + docs + verification

**Files:**
- Modify: `src/bot.js` (add `AutomodState` to context; add `MessageContent` intent)
- Modify: `README.md`

**Interfaces:**
- Consumes: `AutomodState` (T3).
- Produces: `ctx.automod` available to the listener; content filters active when the intent is enabled.

- [ ] **Step 1: Modify `src/bot.js`** — add the import:

```js
import { AutomodState } from "./modules/automod/AutomodState.js";
```

Add `MessageContent` to the intents (after `GuildMessages`):

```js
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
```

Add `automod` to the context (next to `inviteCache`):

```js
    automod: new AutomodState(),
```

- [ ] **Step 2: Verify wiring**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves automod imports resolve and the context builds).

- [ ] **Step 3: Verify the loader picks up the new command/listener**

```bash
node -e 'const R="/Users/hrishi/Desktop/Work/discord-bot";(async()=>{const{discoverCommands,buildCommandMap}=await import(R+"/src/core/CommandHandler.js");const{discoverEvents}=await import(R+"/src/core/EventHandler.js");const m=buildCommandMap(await discoverCommands(R+"/src/modules"));const e=await discoverEvents(R+"/src/modules");console.log("has automod:",m.has("automod"),"commands:",m.size);console.log("has messageCreate listener:",e.some(x=>x.name==="messageCreate"));})()'
```
Expected: `automod` present; a `messageCreate` listener discovered.

- [ ] **Step 4: Update `README.md`** — add an Auto-Moderation section before `## Status`:

````markdown
## Auto-Moderation

`/automod` (Administrator) toggles filters and picks an action (`delete` / `warn` / `timeout`):
anti-spam, anti-mention-spam, invite filter, link filter, mass-caps, and emoji spam. Members with
**Manage Messages**, exempt roles, and exempt channels are skipped (`/automod exempt`). The
content filters (invites/links, caps, emoji) require the privileged **Message Content** intent —
enable it in the Developer Portal; without it those filters simply never trigger.
````

Update `## Status` to:
````markdown
## Status

Phase 1 complete. Phase 2: invite tracking + auto-moderation done; welcome/autorole/reaction-roles
is the last Phase 2 subsystem.
````

- [ ] **Step 5: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS; lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/bot.js README.md
git commit -m "feat(automod): wire automod state and enable message content intent"
```

---

## Self-Review

**Spec coverage (chosen automod scope):**
- Anti-spam → `evaluateMessage` spam branch + `AutomodState` rate tracking (T3–T5). ✓
- Anti-mention-spam → `countMentions` + evaluate branch (T2, T4). ✓
- Invite filter + link filter → `hasInvite`/`hasLink` + evaluate branches (T2, T4). ✓
- Mass-caps → `isCapsSpam` (T2, T4). ✓
- Emoji spam → `isEmojiSpam` (T2, T4). ✓
- Configurable action (delete/warn/timeout) → `applyAutomodAction` (T4) + `/automod action` (T6). ✓
- Exemptions (Manage Messages, roles, channels) → `isExempt` (T4) + `/automod exempt` (T6). ✓
- Word blacklist → intentionally NOT included (user's choice). Not a gap.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every filter, the listener, and the command have complete code and real tests. ✓

**Type consistency:**
- `AutomodConfig` columns (T1) match every consumer: `evaluateMessage`/`isExempt` (T4) read `antiSpam/spamCount/antiMentionSpam/mentionLimit/filterInvites/filterLinks/antiCaps/capsPercent/capsMinLength/antiEmojiSpam/emojiLimit/exemptRoles/exemptChannels`; `applyAutomodAction` reads `action/timeoutSeconds`. ✓
- `AutomodState.recordMessage(guildId, userId, windowMs)` (T3) matches the listener (T5). ✓
- `evaluateMessage({ message, config, spamCount })` / `isExempt({ member, channelId, config })` / `applyAutomodAction({ message, member, config, reason, cases, logger })` (T4) match the listener call sites (T5). ✓
- `ConfigService.updateAutomod` + `getGuild().automod` (T1) match `/automod` (T6) and the listener (T5). ✓
- `ctx.automod` (AutomodState) provided by T7 wiring matches the listener (T5); `ctx.cases` (foundation/moderation) matches `applyAutomodAction`. ✓
- `FILTER_COLUMN` map (T6) targets real `AutomodConfig` boolean columns (T1). ✓
