# Phase 2a — Invite Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track who invited whom — cache each guild's invites, detect the used invite on join, attribute it to an inviter, count real/left/bonus invites, and expose `/invites` (view, leaderboard, add bonus, reset).

**Architecture:** A per-shard in-memory `InviteCache` (code → uses per guild) is seeded on ready/guild-join and kept current by invite create/delete events. On member join, the current invites are diffed against the cache (`findUsedInvite`) to find which code's uses grew — that's the inviter. `InviteService` persists join attribution and computes stats from `MemberInvite` + `InviteBonus`. The diff and the join-processing core are pure/injected and unit-tested.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`Events`, `SlashCommandBuilder`, `PermissionFlagsBits`, `EmbedBuilder`), Prisma (`MemberInvite`, `InviteBonus`), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse:** `COLORS`/`BOT_NAME` (`src/lib/constants.js`), `successEmbed`/`errorEmbed`/`infoEmbed`, `ConfigService`. Do NOT re-implement.
- **All new code under `src/modules/invites/`**; events auto-discovered from `events/*.js`, commands from `commands/*.js`.
- **A guild lives on one shard** — `InviteCache` is in-process per shard; no cross-shard state.
- **Intents:** `GuildInvites` and `GuildMembers` are already enabled in `src/bot.js` (foundation). Invite fetching needs the bot to have **Manage Server**; cache seeding degrades silently when it doesn't.
- **Multiple listeners per event are fine** — anti-nuke, logging, and invites can all listen to `guildMemberAdd`/`guildMemberRemove`.
- **Invite math:** `total = regular + bonus - left`, where `regular` = attributed joins still present, `left` = attributed joins who left.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (`feat(invites): ...`).

---

### Task 1: Schema + `InviteService`

**Files:**
- Modify: `prisma/schema.prisma` (add `MemberInvite`, `InviteBonus`)
- Modify: `prisma/migrations/manual_init.sql` (regenerate)
- Create: `src/modules/invites/InviteService.js`
- Test: `test/modules/invites/InviteService.test.js`

**Interfaces:**
- Consumes: injected Prisma-like client (`memberInvite.upsert/findUnique/update/count/deleteMany/groupBy`, `inviteBonus.upsert/findUnique/deleteMany`).
- Produces: class `InviteService`:
  - `async recordJoin({ guildId, memberId, inviterId, code }): row` — upserts the join attribution (`left: false`).
  - `async markLeft(guildId, memberId): row | null` — marks the member's attribution as left, returns the prior row (or `null`).
  - `async getStats(guildId, userId): { regular, left, bonus, total }`.
  - `async addBonus(guildId, userId, amount): row`.
  - `async reset(guildId, userId): void`.
  - `async leaderboard(guildId, limit=10): { userId, count }[]` (descending).

- [ ] **Step 1: Add models to `prisma/schema.prisma`** (append at the end of the file):

```prisma
model MemberInvite {
  id        String   @id @default(cuid())
  guildId   String
  memberId  String
  inviterId String?
  code      String?
  joinedAt  DateTime @default(now())
  left      Boolean  @default(false)

  @@unique([guildId, memberId])
  @@index([guildId, inviterId])
}

model InviteBonus {
  guildId String
  userId  String
  amount  Int    @default(0)

  @@id([guildId, userId])
}
```

- [ ] **Step 2: Regenerate the Prisma client and offline SQL**

Run:
```bash
npx prisma generate && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual_init.sql
```
Expected: client regenerated; `manual_init.sql` now includes `MemberInvite` and `InviteBonus` tables.

- [ ] **Step 3: Write the failing test `test/modules/invites/InviteService.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { InviteService } from "../../../src/modules/invites/InviteService.js";

function mockPrisma() {
  return {
    memberInvite: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      findUnique: vi.fn(async ({ where }) => ({ ...where.guildId_memberId, inviterId: "inv1" })),
      update: vi.fn(async () => ({})),
      count: vi.fn(async ({ where }) => (where.left ? 2 : 5)),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      groupBy: vi.fn(async () => [
        { inviterId: "a", _count: { inviterId: 3 } },
        { inviterId: "b", _count: { inviterId: 7 } },
      ]),
    },
    inviteBonus: {
      upsert: vi.fn(async ({ create }) => ({ ...create })),
      findUnique: vi.fn(async () => ({ amount: 4 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("InviteService", () => {
  it("records a join attribution", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    await svc.recordJoin({ guildId: "g1", memberId: "m1", inviterId: "inv1", code: "abc" });
    expect(prisma.memberInvite.upsert).toHaveBeenCalled();
  });

  it("marks a member as left and returns the prior row", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const rec = await svc.markLeft("g1", "m1");
    expect(rec.inviterId).toBe("inv1");
    expect(prisma.memberInvite.update).toHaveBeenCalled();
  });

  it("computes stats with the invite formula", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const stats = await svc.getStats("g1", "u1");
    // regular=5, left=2, bonus=4 -> total = 5 + 4 - 2 = 7
    expect(stats).toEqual({ regular: 5, left: 2, bonus: 4, total: 7 });
  });

  it("builds a descending leaderboard", async () => {
    const prisma = mockPrisma();
    const svc = new InviteService(prisma);
    const lb = await svc.leaderboard("g1", 10);
    expect(lb[0]).toEqual({ userId: "b", count: 7 });
    expect(lb[1]).toEqual({ userId: "a", count: 3 });
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run test/modules/invites/InviteService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 5: Write `src/modules/invites/InviteService.js`**

```js
export class InviteService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async recordJoin({ guildId, memberId, inviterId, code }) {
    return this.prisma.memberInvite.upsert({
      where: { guildId_memberId: { guildId, memberId } },
      create: { guildId, memberId, inviterId, code, left: false },
      update: { inviterId, code, left: false, joinedAt: new Date() },
    });
  }

  async markLeft(guildId, memberId) {
    const rec = await this.prisma.memberInvite.findUnique({
      where: { guildId_memberId: { guildId, memberId } },
    });
    if (!rec) return null;
    await this.prisma.memberInvite.update({
      where: { guildId_memberId: { guildId, memberId } },
      data: { left: true },
    });
    return rec;
  }

  async getStats(guildId, userId) {
    const regular = await this.prisma.memberInvite.count({
      where: { guildId, inviterId: userId, left: false },
    });
    const left = await this.prisma.memberInvite.count({
      where: { guildId, inviterId: userId, left: true },
    });
    const bonusRow = await this.prisma.inviteBonus.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    const bonus = bonusRow?.amount ?? 0;
    return { regular, left, bonus, total: regular + bonus - left };
  }

  async addBonus(guildId, userId, amount) {
    return this.prisma.inviteBonus.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, amount },
      update: { amount: { increment: amount } },
    });
  }

  async reset(guildId, userId) {
    await this.prisma.memberInvite.deleteMany({ where: { guildId, inviterId: userId } });
    await this.prisma.inviteBonus.deleteMany({ where: { guildId, userId } });
  }

  async leaderboard(guildId, limit = 10) {
    const grouped = await this.prisma.memberInvite.groupBy({
      by: ["inviterId"],
      where: { guildId, left: false, inviterId: { not: null } },
      _count: { inviterId: true },
    });
    return grouped
      .map((g) => ({ userId: g.inviterId, count: g._count.inviterId }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/modules/invites/InviteService.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/manual_init.sql src/modules/invites/InviteService.js test/modules/invites/InviteService.test.js
git commit -m "feat(invites): add invite schema and service"
```

---

### Task 2: `InviteCache` + `findUsedInvite`

**Files:**
- Create: `src/modules/invites/InviteCache.js`
- Test: `test/modules/invites/InviteCache.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findUsedInvite(cachedMap, fresh): { code, inviterId } | null` — `cachedMap` is `Map<code, uses>`; `fresh` is `[{ code, uses, inviterId }]`. Returns the first invite whose `uses` exceeds its cached value (new codes count as previous `0`), else `null`.
  - class `InviteCache`: `getGuild(guildId): Map<code, uses>`; `setGuild(guildId, fresh)` (fresh = `[{ code, uses }]`); `update(guildId, code, uses)`; `remove(guildId, code)`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { findUsedInvite, InviteCache } from "../../../src/modules/invites/InviteCache.js";

describe("findUsedInvite", () => {
  it("finds the code whose uses increased", () => {
    const cached = new Map([["abc", 5], ["xyz", 1]]);
    const fresh = [
      { code: "abc", uses: 6, inviterId: "u1" },
      { code: "xyz", uses: 1, inviterId: "u2" },
    ];
    expect(findUsedInvite(cached, fresh)).toEqual({ code: "abc", inviterId: "u1" });
  });
  it("treats a brand-new code as used", () => {
    const cached = new Map();
    const fresh = [{ code: "new", uses: 1, inviterId: "u3" }];
    expect(findUsedInvite(cached, fresh)).toEqual({ code: "new", inviterId: "u3" });
  });
  it("returns null when nothing changed", () => {
    const cached = new Map([["abc", 5]]);
    const fresh = [{ code: "abc", uses: 5, inviterId: "u1" }];
    expect(findUsedInvite(cached, fresh)).toBeNull();
  });
});

describe("InviteCache", () => {
  it("stores and reads guild invite maps", () => {
    const c = new InviteCache();
    c.setGuild("g1", [{ code: "abc", uses: 3 }]);
    expect(c.getGuild("g1").get("abc")).toBe(3);
  });
  it("updates and removes single codes", () => {
    const c = new InviteCache();
    c.setGuild("g1", [{ code: "abc", uses: 3 }]);
    c.update("g1", "abc", 4);
    expect(c.getGuild("g1").get("abc")).toBe(4);
    c.remove("g1", "abc");
    expect(c.getGuild("g1").has("abc")).toBe(false);
  });
  it("returns an empty map for unknown guilds", () => {
    expect(new InviteCache().getGuild("nope").size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/invites/InviteCache.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/invites/InviteCache.js`**

```js
export function findUsedInvite(cachedMap, fresh) {
  for (const inv of fresh) {
    const prev = cachedMap.get(inv.code) ?? 0;
    if (inv.uses > prev) return { code: inv.code, inviterId: inv.inviterId };
  }
  return null;
}

export class InviteCache {
  constructor() {
    this.guilds = new Map(); // guildId -> Map<code, uses>
  }

  getGuild(guildId) {
    return this.guilds.get(guildId) ?? new Map();
  }

  setGuild(guildId, fresh) {
    this.guilds.set(guildId, new Map(fresh.map((i) => [i.code, i.uses])));
  }

  update(guildId, code, uses) {
    const map = this.guilds.get(guildId) ?? new Map();
    map.set(code, uses);
    this.guilds.set(guildId, map);
  }

  remove(guildId, code) {
    this.guilds.get(guildId)?.delete(code);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/invites/InviteCache.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/invites/InviteCache.js test/modules/invites/InviteCache.test.js
git commit -m "feat(invites): add invite cache and used-invite diff"
```

---

### Task 3: Cache-maintenance listeners (ready, guildCreate, inviteCreate, inviteDelete)

**Files:**
- Create: `src/modules/invites/fetchInvites.js`
- Create: `src/modules/invites/events/ready.js`
- Create: `src/modules/invites/events/guildCreate.js`
- Create: `src/modules/invites/events/inviteCreate.js`
- Create: `src/modules/invites/events/inviteDelete.js`
- Test: `test/modules/invites/cacheListeners.test.js`

**Interfaces:**
- Consumes: `Events`; `ctx.inviteCache` (Task 2); `ctx.logger`.
- Produces:
  - `async fetchInvitesFor(guild): [{ code, uses, inviterId }]` — fetches and normalizes a guild's invites; returns `[]` on failure (missing permission).
  - `ready` (once) listener seeds the cache for every guild in `client.guilds.cache`.
  - `guildCreate` listener seeds the cache for a newly joined guild.
  - `inviteCreate`/`inviteDelete` listeners update/remove single codes.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import ready from "../../../src/modules/invites/events/ready.js";
import inviteCreate from "../../../src/modules/invites/events/inviteCreate.js";
import inviteDelete from "../../../src/modules/invites/events/inviteDelete.js";
import { InviteCache } from "../../../src/modules/invites/InviteCache.js";

function ctx() {
  return { inviteCache: new InviteCache(), logger: { error: vi.fn(), info: vi.fn() } };
}

function guild(id, invites) {
  return {
    id,
    invites: { fetch: vi.fn(async () => new Map(invites.map((i) => [i.code, i]))) },
  };
}

describe("ready listener", () => {
  it("seeds the cache for each guild", async () => {
    const c = ctx();
    const g = guild("g1", [{ code: "abc", uses: 2, inviter: { id: "u1" } }]);
    const client = { guilds: { cache: new Map([["g1", g]]) } };
    await ready.execute(c, client);
    expect(c.inviteCache.getGuild("g1").get("abc")).toBe(2);
  });
});

describe("inviteCreate / inviteDelete", () => {
  it("adds a created invite to the cache", async () => {
    const c = ctx();
    await inviteCreate.execute(c, { guild: { id: "g1" }, code: "new", uses: 0 });
    expect(c.inviteCache.getGuild("g1").has("new")).toBe(true);
  });
  it("removes a deleted invite from the cache", async () => {
    const c = ctx();
    c.inviteCache.setGuild("g1", [{ code: "old", uses: 3 }]);
    await inviteDelete.execute(c, { guild: { id: "g1" }, code: "old" });
    expect(c.inviteCache.getGuild("g1").has("old")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/invites/cacheListeners.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/invites/fetchInvites.js`**

```js
export async function fetchInvitesFor(guild) {
  try {
    const invites = await guild.invites.fetch();
    return [...invites.values()].map((i) => ({
      code: i.code,
      uses: i.uses ?? 0,
      inviterId: i.inviter?.id ?? null,
    }));
  } catch {
    return []; // missing Manage Server permission, etc.
  }
}
```

- [ ] **Step 4: Write `src/modules/invites/events/ready.js`**

```js
import { Events } from "discord.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(ctx, client) {
    for (const guild of client.guilds.cache.values()) {
      const fresh = await fetchInvitesFor(guild);
      ctx.inviteCache.setGuild(guild.id, fresh);
    }
    ctx.logger.info?.("invite cache seeded");
  },
};
```

- [ ] **Step 5: Write `src/modules/invites/events/guildCreate.js`**

```js
import { Events } from "discord.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.GuildCreate,
  async execute(ctx, guild) {
    const fresh = await fetchInvitesFor(guild);
    ctx.inviteCache.setGuild(guild.id, fresh);
  },
};
```

- [ ] **Step 6: Write `src/modules/invites/events/inviteCreate.js`**

```js
import { Events } from "discord.js";

export default {
  name: Events.InviteCreate,
  async execute(ctx, invite) {
    if (!invite.guild) return;
    ctx.inviteCache.update(invite.guild.id, invite.code, invite.uses ?? 0);
  },
};
```

- [ ] **Step 7: Write `src/modules/invites/events/inviteDelete.js`**

```js
import { Events } from "discord.js";

export default {
  name: Events.InviteDelete,
  async execute(ctx, invite) {
    if (!invite.guild) return;
    ctx.inviteCache.remove(invite.guild.id, invite.code);
  },
};
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run test/modules/invites/cacheListeners.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 9: Commit**

```bash
git add src/modules/invites/fetchInvites.js src/modules/invites/events/ready.js src/modules/invites/events/guildCreate.js src/modules/invites/events/inviteCreate.js src/modules/invites/events/inviteDelete.js test/modules/invites/cacheListeners.test.js
git commit -m "feat(invites): maintain per-guild invite cache from gateway events"
```

---

### Task 4: Join attribution + leave tracking

**Files:**
- Create: `src/modules/invites/join.js`
- Create: `src/modules/invites/events/guildMemberAdd.js`
- Create: `src/modules/invites/events/guildMemberRemove.js`
- Test: `test/modules/invites/join.test.js`

**Interfaces:**
- Consumes: `findUsedInvite` (T2), `fetchInvitesFor` (T3), `InviteService` (T1), `InviteCache` (T2).
- Produces:
  - `async processInviteJoin({ member, inviteCache, service, fetchInvites, logger }): { code, inviterId } | null` — diffs fresh vs cached invites, records the join attribution, re-syncs the cache; returns the used invite or `null`.
  - `guildMemberAdd` listener wraps `processInviteJoin` with the real `fetchInvitesFor`.
  - `guildMemberRemove` listener calls `service.markLeft`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { processInviteJoin } from "../../../src/modules/invites/join.js";
import { InviteCache } from "../../../src/modules/invites/InviteCache.js";

describe("processInviteJoin", () => {
  it("attributes the join to the inviter and records it", async () => {
    const cache = new InviteCache();
    cache.setGuild("g1", [{ code: "abc", uses: 5 }]);
    const service = { recordJoin: vi.fn(async () => ({})) };
    const fetchInvites = vi.fn(async () => [{ code: "abc", uses: 6, inviterId: "inv1" }]);
    const member = { id: "m1", guild: { id: "g1" } };

    const used = await processInviteJoin({ member, inviteCache: cache, service, fetchInvites, logger: { error: vi.fn() } });
    expect(used).toEqual({ code: "abc", inviterId: "inv1" });
    expect(service.recordJoin).toHaveBeenCalledWith({ guildId: "g1", memberId: "m1", inviterId: "inv1", code: "abc" });
    // cache re-synced to fresh uses
    expect(cache.getGuild("g1").get("abc")).toBe(6);
  });

  it("records an unknown attribution when no invite changed", async () => {
    const cache = new InviteCache();
    cache.setGuild("g1", [{ code: "abc", uses: 5 }]);
    const service = { recordJoin: vi.fn(async () => ({})) };
    const fetchInvites = vi.fn(async () => [{ code: "abc", uses: 5, inviterId: "inv1" }]);
    const member = { id: "m2", guild: { id: "g1" } };

    const used = await processInviteJoin({ member, inviteCache: cache, service, fetchInvites, logger: { error: vi.fn() } });
    expect(used).toBeNull();
    expect(service.recordJoin).toHaveBeenCalledWith({ guildId: "g1", memberId: "m2", inviterId: null, code: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/invites/join.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/invites/join.js`**

```js
import { findUsedInvite } from "./InviteCache.js";

export async function processInviteJoin({ member, inviteCache, service, fetchInvites, logger }) {
  const guildId = member.guild.id;
  try {
    const fresh = await fetchInvites(member.guild);
    const cached = inviteCache.getGuild(guildId);
    const used = findUsedInvite(cached, fresh);
    inviteCache.setGuild(guildId, fresh);
    await service.recordJoin({
      guildId,
      memberId: member.id,
      inviterId: used?.inviterId ?? null,
      code: used?.code ?? null,
    });
    return used;
  } catch (err) {
    logger.error({ err }, "invite join processing failed");
    return null;
  }
}
```

- [ ] **Step 4: Write `src/modules/invites/events/guildMemberAdd.js`**

```js
import { Events } from "discord.js";
import { processInviteJoin } from "../join.js";
import { fetchInvitesFor } from "../fetchInvites.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    await processInviteJoin({
      member,
      inviteCache: ctx.inviteCache,
      service: ctx.invites,
      fetchInvites: fetchInvitesFor,
      logger: ctx.logger,
    });
  },
};
```

- [ ] **Step 5: Write `src/modules/invites/events/guildMemberRemove.js`**

```js
import { Events } from "discord.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member.guild) return;
    await ctx.invites.markLeft(member.guild.id, member.id).catch((err) =>
      ctx.logger.error({ err }, "invite leave tracking failed"),
    );
  },
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/modules/invites/join.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/invites/join.js src/modules/invites/events/guildMemberAdd.js src/modules/invites/events/guildMemberRemove.js test/modules/invites/join.test.js
git commit -m "feat(invites): attribute joins and track leaves"
```

---

### Task 5: `/invites` command

**Files:**
- Create: `src/modules/invites/commands/invites.js`
- Test: `test/modules/invites/invitesCommand.test.js`

**Interfaces:**
- Consumes: `ctx.invites` (T1); `EmbedBuilder`, `COLORS`, `successEmbed`, `PermissionFlagsBits`.
- Produces: default-export command with subcommands: `view [user]`, `leaderboard`, `add user amount` (Manage Guild), `reset user` (Manage Guild).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/invites/commands/invites.js";

function ctx() {
  return {
    invites: {
      getStats: vi.fn(async () => ({ regular: 5, left: 2, bonus: 4, total: 7 })),
      leaderboard: vi.fn(async () => [{ userId: "b", count: 7 }, { userId: "a", count: 3 }]),
      addBonus: vi.fn(async () => ({})),
      reset: vi.fn(async () => {}),
    },
    logger: { error: vi.fn() },
  };
}
function interaction(sub, opts = {}) {
  return {
    guildId: "g1",
    user: { id: "self1" },
    options: {
      getSubcommand: () => sub,
      getUser: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/invites", () => {
  it("view defaults to the caller and shows stats", async () => {
    const c = ctx();
    const i = interaction("view");
    await command.execute(i, c);
    expect(c.invites.getStats).toHaveBeenCalledWith("g1", "self1");
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("view can target another user", async () => {
    const c = ctx();
    await command.execute(interaction("view", { user: { id: "other" } }), c);
    expect(c.invites.getStats).toHaveBeenCalledWith("g1", "other");
  });

  it("leaderboard replies with an embed", async () => {
    const c = ctx();
    const i = interaction("leaderboard");
    await command.execute(i, c);
    expect(c.invites.leaderboard).toHaveBeenCalledWith("g1", expect.any(Number));
    expect(i.reply).toHaveBeenCalled();
  });

  it("add gives bonus invites", async () => {
    const c = ctx();
    await command.execute(interaction("add", { user: { id: "u9" }, amount: 5 }), c);
    expect(c.invites.addBonus).toHaveBeenCalledWith("g1", "u9", 5);
  });

  it("reset clears a user's invites", async () => {
    const c = ctx();
    await command.execute(interaction("reset", { user: { id: "u9" } }), c);
    expect(c.invites.reset).toHaveBeenCalledWith("g1", "u9");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/invites/invitesCommand.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/invites/commands/invites.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { COLORS } from "../../../lib/constants.js";
import { successEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("View invite stats and the invite leaderboard.")
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View invite stats for yourself or another member.")
        .addUserOption((o) => o.setName("user").setDescription("Member to look up")),
    )
    .addSubcommand((s) => s.setName("leaderboard").setDescription("Top inviters in this server."))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add bonus invites to a member (Manage Server).")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("Bonus invites").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("Reset a member's invites (Manage Server).")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
    ),
  permissions: [],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "view") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const stats = await ctx.invites.getStats(guildId, user.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`📨 Invites — ${user.id === interaction.user.id ? "you" : user.id}`)
        .setDescription(
          `**Total:** ${stats.total}\n` +
            `Regular: ${stats.regular} · Left: ${stats.left} · Bonus: ${stats.bonus}`,
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === "leaderboard") {
      const board = await ctx.invites.leaderboard(guildId, 10);
      const embed = new EmbedBuilder().setColor(COLORS.info).setTitle("🏆 Invite Leaderboard");
      embed.setDescription(
        board.length
          ? board.map((e, idx) => `**${idx + 1}.** <@${e.userId}> — ${e.count}`).join("\n")
          : "No invites tracked yet.",
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // add / reset require Manage Server
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [successEmbed("This subcommand requires the **Manage Server** permission.")],
        ephemeral: true,
      });
      return;
    }

    if (sub === "add") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      await ctx.invites.addBonus(guildId, user.id, amount);
      await interaction.reply({ embeds: [successEmbed(`Gave <@${user.id}> **${amount}** bonus invite(s).`)] });
      return;
    }
    if (sub === "reset") {
      const user = interaction.options.getUser("user");
      await ctx.invites.reset(guildId, user.id);
      await interaction.reply({ embeds: [successEmbed(`Reset invites for <@${user.id}>.`)] });
    }
  },
};
```

Note: the test's `interaction` has no `memberPermissions`, so `add`/`reset` guard uses optional chaining `?.has(...)` — with `memberPermissions` undefined it would deny. To let the test exercise `add`/`reset`, the test provides `memberPermissions`. Update the test's `interaction` factory to include it:

```js
    memberPermissions: { has: () => true },
```

Add that line to the `interaction` object returned in the test (Step 1) so the `add` and `reset` cases pass the Manage-Server guard.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/invites/invitesCommand.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/invites/commands/invites.js test/modules/invites/invitesCommand.test.js
git commit -m "feat(invites): add /invites command"
```

---

### Task 6: Wiring + docs + verification

**Files:**
- Modify: `src/bot.js` (add `InviteCache` + `InviteService` to context)
- Modify: `README.md`

**Interfaces:**
- Consumes: `InviteCache` (T2), `InviteService` (T1).
- Produces: `ctx.inviteCache` and `ctx.invites` available to every event/command.

- [ ] **Step 1: Modify `src/bot.js`** — add imports:

```js
import { InviteService } from "./modules/invites/InviteService.js";
import { InviteCache } from "./modules/invites/InviteCache.js";
```

Add to the `context` object (alongside `cases`):

```js
    invites: new InviteService(prisma),
    inviteCache: new InviteCache(),
```

- [ ] **Step 2: Verify wiring (fails only on missing env)**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves all invite imports resolve and the context builds).

- [ ] **Step 3: Verify the loader picks up the new command/events** — run the loader probe:

```bash
node -e 'const R="/Users/hrishi/Desktop/Work/discord-bot";(async()=>{const{discoverCommands,buildCommandMap}=await import(R+"/src/core/CommandHandler.js");const{discoverEvents}=await import(R+"/src/core/EventHandler.js");const m=buildCommandMap(await discoverCommands(R+"/src/modules"));const e=await discoverEvents(R+"/src/modules");console.log("commands:",m.size,"has invites:",m.has("invites"));console.log("listeners:",e.length);})()'
```
Expected: `invites` present in the command map; listener count increased (invite events discovered).

- [ ] **Step 4: Update `README.md`** — add an Invite Tracking section before `## Status`:

````markdown
## Invite Tracking

Tracks who invited whom by diffing cached invite uses on join. `/invites view [user]` shows a
member's **total / regular / left / bonus** counts; `/invites leaderboard` ranks top inviters;
`/invites add <user> <amount>` and `/invites reset <user>` (Manage Server) adjust bonus invites.
Requires the bot to have **Manage Server** so it can read the invite list.
````

Update `## Status` to:

````markdown
## Status

Phase 1 complete. Phase 2 in progress: **invite tracking done**; auto-moderation and
welcome/autorole/reaction-roles next.
````

- [ ] **Step 5: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS; lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/bot.js README.md
git commit -m "feat(invites): wire invite tracking into the bot"
```

---

## Self-Review

**Spec coverage (Phase 2 invite tracker, spec §16):**
- Who invited whom → Tasks 1–4 (attribution via cache diff). ✓
- Real / left / bonus counts → `InviteService.getStats` (T1), leave tracking (T4). ✓
- Leaderboard → `InviteService.leaderboard` (T1) + `/invites leaderboard` (T5). ✓
- Bonus/adjustments → `addBonus`/`reset` (T1) + `/invites add|reset` (T5). ✓
- Invite-reward roles → **explicitly deferred** to the autorole subsystem (noted in the plan intro). Not a gap.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every unit has complete code and real tests. The Task 5 note gives the exact `memberPermissions` line the test needs — no ambiguity. ✓

**Type consistency:**
- `InviteService` methods (T1) match `/invites` (T5), `processInviteJoin` (T4), and `guildMemberRemove` (T4). ✓
- `findUsedInvite(cachedMap, fresh)` + `InviteCache` API (T2) match `processInviteJoin` (T4) and cache listeners (T3). ✓
- `fetchInvitesFor(guild)` (T3) matches `guildMemberAdd` (T4) and the ready/guildCreate listeners (T3). ✓
- `ctx.inviteCache` / `ctx.invites` provided by T6 wiring match all consumers (T3, T4, T5). ✓
- Events used (`ClientReady`, `GuildCreate`, `InviteCreate`, `InviteDelete`, `GuildMemberAdd`, `GuildMemberRemove`) are all delivered under intents already enabled in the foundation (`Guilds`, `GuildInvites`, `GuildMembers`). ✓
