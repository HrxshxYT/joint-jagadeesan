# /lockserver Server-Wide Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/lockserver`, `/unlockserver`, and `/lockserver status` — a server-wide lockdown system that snapshots the exact prior permission state (allow/deny/neutral) to Postgres and restores it precisely, restart-safe.

**Architecture:** A new auto-discovered `lockdown` module exposes a `LockdownService` (injected as `ctx.lockdown`). Pure snapshot/restore helpers encode overwrite tri-state; per-tier apply functions mutate the guild; a concurrency-limited batch runner handles N-channel tiers; the existing once-per-minute `mod-expiry` sweep is extended to auto-unlock expired lockdowns. Anti-nuke calls the same `panic()` path behind an opt-in flag.

**Tech Stack:** discord.js v14, Node ESM, Prisma + PostgreSQL, Vitest, node-cron (via existing `Scheduler`).

## Global Constraints

- No new npm dependencies. Concurrency/batching hand-rolled.
- Do not modify the existing per-channel `/lockdown` or `/unlock` commands.
- Never delete invites; never kick/ban as part of lockdown.
- Snapshots persist in Postgres, never memory. Restart mid-lockdown must not strand a server.
- Neutral (unset) overwrites restore to `null`, never `allow`.
- Guild owner and the bot are always exempt from effects.
- Command permission: `Administrator` OR `ManageGuild` (via `permissions` array + `setDefaultMemberPermissions(ManageGuild)`).
- Purple-forward embeds via `src/lib/embeds.js` / `COLORS.brand` (`0x8b5cf6`).
- Duration strings parsed by existing `src/lib/duration.js` (`parseDuration`, `formatDuration`).
- ESM imports with `.js` extensions; match existing file style (2-space indent, double quotes, Prettier).
- Tests mock Prisma as plain objects and use fake guild/channel objects — never a live DB or real discord.js gateway.

---

## Task 1: Prisma models + migration + anti-nuke flag

**Files:**
- Modify: `prisma/schema.prisma` (add two models, `Guild.lockdown` relation, `AntinukeConfig.autoLockOnTrigger`)
- Create: `prisma/migrations/20260723000000_lockdown/migration.sql`

**Interfaces:**
- Produces: Prisma models `LockdownState`, `LockdownSnapshot`; generated client accessors `prisma.lockdownState`, `prisma.lockdownSnapshot`; field `AntinukeConfig.autoLockOnTrigger`.

- [ ] **Step 1: Add the relation field to `Guild`**

In `prisma/schema.prisma`, inside `model Guild { … }`, add after the `dashboards` line:

```prisma
  lockdown      LockdownState?
```

- [ ] **Step 2: Add the `autoLockOnTrigger` flag to `AntinukeConfig`**

In `model AntinukeConfig { … }`, add after the `panicMode` line:

```prisma
  autoLockOnTrigger Boolean @default(false) // fire /lockserver panic when a trigger fires
```

- [ ] **Step 3: Add the two lockdown models**

Append to `prisma/schema.prisma`:

```prisma
model LockdownState {
  id                     String    @id @default(cuid())
  guildId                String    @unique
  guild                  Guild     @relation(fields: [guildId], references: [id], onDelete: Cascade)
  tier                   String // panic|channels|invites|joins|voice|full
  reason                 String    @default("No reason provided")
  startedById            String
  startedAt              DateTime  @default(now())
  expiresAt              DateTime?
  priorVerificationLevel Int?
  invitesPausedByUs      Boolean   @default(false)
  caseNumber             Int?
  status                 String    @default("active") // active|lifted|failed
  snapshots              LockdownSnapshot[]

  @@index([expiresAt])
}

model LockdownSnapshot {
  id         String        @id @default(cuid())
  lockdownId String
  lockdown   LockdownState @relation(fields: [lockdownId], references: [id], onDelete: Cascade)
  targetType String // "channel" = channel overwrite; "role" = guild-level role permission (panic)
  channelId  String? // where the overwrite lives; null for role-level
  targetId   String // overwrite holder: role/member the overwrite or permission applies to
  field      String // SendMessages | Connect | Speak
  priorAllow Boolean
  priorDeny  Boolean
  addedByUs  Boolean       @default(false)

  @@index([lockdownId])
}
```

- [ ] **Step 4: Write the migration SQL by hand**

Create `prisma/migrations/20260723000000_lockdown/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "AntinukeConfig" ADD COLUMN "autoLockOnTrigger" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LockdownState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'No reason provided',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "priorVerificationLevel" INTEGER,
    "invitesPausedByUs" BOOLEAN NOT NULL DEFAULT false,
    "caseNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "LockdownState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockdownSnapshot" (
    "id" TEXT NOT NULL,
    "lockdownId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "channelId" TEXT,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "priorAllow" BOOLEAN NOT NULL,
    "priorDeny" BOOLEAN NOT NULL,
    "addedByUs" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LockdownSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LockdownState_guildId_key" ON "LockdownState"("guildId");

-- CreateIndex
CREATE INDEX "LockdownState_expiresAt_idx" ON "LockdownState"("expiresAt");

-- CreateIndex
CREATE INDEX "LockdownSnapshot_lockdownId_idx" ON "LockdownSnapshot"("lockdownId");

-- AddForeignKey
ALTER TABLE "LockdownState" ADD CONSTRAINT "LockdownState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockdownSnapshot" ADD CONSTRAINT "LockdownSnapshot_lockdownId_fkey" FOREIGN KEY ("lockdownId") REFERENCES "LockdownState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Validate schema and regenerate client (offline)**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and "Generated Prisma Client". (No DB connection needed for either.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260723000000_lockdown
git commit -m "feat(lockdown): add LockdownState/LockdownSnapshot models and anti-nuke autoLock flag"
```

---

## Task 2: Snapshot/restore tri-state helpers

The correctness core: encode overwrite state as allow/deny/neutral and restore it exactly.

**Files:**
- Create: `src/modules/lockdown/snapshot.js`
- Test: `test/modules/lockdown/snapshot.test.js`

**Interfaces:**
- Produces:
  - `decodeState({ priorAllow, priorDeny }) → true | false | null`
  - `readOverwrite(channel, holderId, field) → { priorAllow: boolean, priorDeny: boolean }`
  - `snapshotChannelField(channel, holderId, field) → { targetType:"channel", channelId, targetId, field, priorAllow, priorDeny }`
  - `snapshotRolePerm(role, field) → { targetType:"role", channelId:null, targetId, field, priorAllow, priorDeny:false }`
  - `restoreRow(guild, row, reason) → Promise<void>` (edits channel overwrite or role perm back to prior)

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/snapshot.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import {
  decodeState,
  readOverwrite,
  snapshotChannelField,
  restoreRow,
} from "../../../src/modules/lockdown/snapshot.js";

const SEND = "SendMessages";

// Fake channel whose overwrite cache reflects allow/deny bitfields.
function fakeChannel(id, overwrites = {}) {
  const cache = new Map();
  for (const [holderId, { allow = 0n, deny = 0n }] of Object.entries(overwrites)) {
    cache.set(holderId, {
      id: holderId,
      allow: new PermissionsBitField(allow),
      deny: new PermissionsBitField(deny),
    });
  }
  return {
    id,
    permissionOverwrites: { cache, edit: vi.fn(async () => {}) },
  };
}

describe("snapshot tri-state", () => {
  it("decodes allow/deny/neutral to true/false/null", () => {
    expect(decodeState({ priorAllow: true, priorDeny: false })).toBe(true);
    expect(decodeState({ priorAllow: false, priorDeny: true })).toBe(false);
    expect(decodeState({ priorAllow: false, priorDeny: false })).toBe(null);
  });

  it("reads a neutral overwrite as neither allow nor deny", () => {
    const ch = fakeChannel("c1"); // no overwrite for @everyone
    expect(readOverwrite(ch, "everyone", SEND)).toEqual({
      priorAllow: false,
      priorDeny: false,
    });
  });

  it("reads an explicit allow", () => {
    const ch = fakeChannel("c1", {
      everyone: { allow: PermissionFlagsBits.SendMessages },
    });
    expect(readOverwrite(ch, "everyone", SEND)).toEqual({
      priorAllow: true,
      priorDeny: false,
    });
  });

  it("round-trips neutral -> deny -> restore back to neutral (null), not allow", async () => {
    const ch = fakeChannel("c1"); // neutral
    const snap = snapshotChannelField(ch, "everyone", SEND);
    expect(snap).toMatchObject({
      targetType: "channel",
      channelId: "c1",
      targetId: "everyone",
      field: SEND,
      priorAllow: false,
      priorDeny: false,
    });

    // simulate the lock having denied it, then restore from the snapshot
    const guild = { channels: { cache: new Map([["c1", ch]]) }, roles: { cache: new Map() } };
    await restoreRow(guild, snap, "unlock");

    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone",
      { [SEND]: null },
      { reason: "unlock" },
    );
  });

  it("restores an explicit prior allow back to allow", async () => {
    const ch = fakeChannel("c1", { everyone: { allow: PermissionFlagsBits.SendMessages } });
    const snap = snapshotChannelField(ch, "everyone", SEND);
    const guild = { channels: { cache: new Map([["c1", ch]]) }, roles: { cache: new Map() } };
    await restoreRow(guild, snap, "unlock");
    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone",
      { [SEND]: true },
      { reason: "unlock" },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/snapshot.test.js`
Expected: FAIL — cannot resolve `../../../src/modules/lockdown/snapshot.js`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/lockdown/snapshot.js`:

```js
import { PermissionsBitField } from "discord.js";

// Three prior states of a permission field, encoded as two booleans:
//   allow   -> (true, false)
//   deny    -> (false, true)
//   neutral -> (false, false)   <- the state naive lockdowns destroy
export function decodeState({ priorAllow, priorDeny }) {
  if (priorAllow) return true;
  if (priorDeny) return false;
  return null;
}

// Read the current tri-state of `field` on a channel overwrite for `holderId`.
export function readOverwrite(channel, holderId, field) {
  const ow = channel.permissionOverwrites.cache.get(holderId);
  if (!ow) return { priorAllow: false, priorDeny: false };
  return {
    priorAllow: ow.allow.has(PermissionsBitField.Flags[field]),
    priorDeny: ow.deny.has(PermissionsBitField.Flags[field]),
  };
}

export function snapshotChannelField(channel, holderId, field) {
  const { priorAllow, priorDeny } = readOverwrite(channel, holderId, field);
  return {
    targetType: "channel",
    channelId: channel.id,
    targetId: holderId,
    field,
    priorAllow,
    priorDeny,
    addedByUs: false,
  };
}

export function snapshotRolePerm(role, field) {
  return {
    targetType: "role",
    channelId: null,
    targetId: role.id,
    field,
    priorAllow: role.permissions.has(PermissionsBitField.Flags[field]),
    priorDeny: false,
    addedByUs: false,
  };
}

// Restore one snapshot row to its exact prior state. Channel overwrite rows are
// restored field-by-field (true/false/null); role-permission rows (panic) flip
// the guild-level bit back.
export async function restoreRow(guild, row, reason) {
  if (row.targetType === "role") {
    const role = guild.roles.cache.get(row.targetId) ?? guild.roles.everyone;
    const flag = PermissionsBitField.Flags[row.field];
    const next = row.priorAllow ? role.permissions.add(flag) : role.permissions.remove(flag);
    await role.setPermissions(next, reason);
    return;
  }
  const channel = guild.channels.cache.get(row.channelId);
  if (!channel) throw new Error(`channel ${row.channelId} not found`);
  await channel.permissionOverwrites.edit(
    row.targetId,
    { [row.field]: decodeState(row) },
    { reason },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/snapshot.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/lockdown/snapshot.js test/modules/lockdown/snapshot.test.js
git commit -m "feat(lockdown): tri-state snapshot/restore helpers"
```

---

## Task 3: Concurrency-limited batch runner

**Files:**
- Create: `src/modules/lockdown/batch.js`
- Test: `test/modules/lockdown/batch.test.js`

**Interfaces:**
- Produces: `runBatched(items, worker, { concurrency = 6, onProgress } = {}) → Promise<{ succeeded: any[], failed: { item, error }[] }>`
  - `worker(item, index) → Promise<any>`; a throw is caught and recorded in `failed`.
  - `onProgress(done, total)` called after every settled item.

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/batch.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { runBatched } from "../../../src/modules/lockdown/batch.js";

describe("runBatched", () => {
  it("processes all items and reports progress per completion", async () => {
    const items = [1, 2, 3, 4, 5];
    const progress = [];
    const res = await runBatched(items, async (n) => n * 2, {
      concurrency: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(res.succeeded.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
    expect(res.failed).toEqual([]);
    expect(progress.at(-1)).toEqual([5, 5]);
  });

  it("continues past failures and records them", async () => {
    const items = ["a", "b", "c"];
    const res = await runBatched(
      items,
      async (x) => {
        if (x === "b") throw new Error("boom");
        return x.toUpperCase();
      },
      { concurrency: 3 },
    );
    expect(res.succeeded.sort()).toEqual(["A", "C"]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].item).toBe("b");
    expect(res.failed[0].error.message).toBe("boom");
  });

  it("never runs more than `concurrency` workers at once", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runBatched(
      items,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
      { concurrency: 4 },
    );
    expect(peak).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/batch.test.js`
Expected: FAIL — cannot resolve `batch.js`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/lockdown/batch.js`:

```js
// Fixed-size worker pool. Never fires all requests at once — at most
// `concurrency` are in flight. Failures are collected, not thrown, so a
// partial lockdown still records which targets succeeded.
export async function runBatched(items, worker, { concurrency = 6, onProgress } = {}) {
  const succeeded = [];
  const failed = [];
  let next = 0;
  let done = 0;
  const total = items.length;

  async function pump() {
    while (next < total) {
      const index = next++;
      const item = items[index];
      try {
        succeeded.push(await worker(item, index));
      } catch (error) {
        failed.push({ item, error });
      }
      done++;
      onProgress?.(done, total);
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, total) }, () => pump());
  await Promise.all(pool);
  return { succeeded, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/batch.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/lockdown/batch.js test/modules/lockdown/batch.test.js
git commit -m "feat(lockdown): concurrency-limited batch runner"
```

---

## Task 4: Per-tier apply functions

**Files:**
- Create: `src/modules/lockdown/tiers.js`
- Test: `test/modules/lockdown/tiers.test.js`

**Interfaces:**
- Consumes: `snapshot.js` (`snapshotChannelField`, `snapshotRolePerm`), `batch.js` (`runBatched`).
- Produces (all async; each returns a partial result merged by the service):
  - `applyPanic(guild, { reason }) → { snapshots: Row[] }`
  - `applyChannels(guild, { channelIds, modRoleIds, reason, onProgress }) → { snapshots: Row[], failed: {item,error}[] }`
  - `applyVoice(guild, { channelIds, modRoleIds, reason, onProgress }) → { snapshots: Row[], failed: {item,error}[] }`
  - `applyInvites(guild, { reason }) → { invitesPausedByUs: boolean }`
  - `applyJoins(guild, { reason }) → { priorVerificationLevel: number }`
  - `textChannelIds(guild) → string[]`, `voiceChannelIds(guild) → string[]` (helpers)
  - `Row` is a snapshot object shaped like `snapshotChannelField`'s output (includes `addedByUs`).

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/tiers.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import {
  ChannelType,
  GuildVerificationLevel,
  PermissionsBitField,
  PermissionFlagsBits,
} from "discord.js";
import { applyPanic, applyChannels, applyInvites, applyJoins } from "../../../src/modules/lockdown/tiers.js";

function everyoneRole() {
  return {
    id: "everyone",
    permissions: new PermissionsBitField(PermissionFlagsBits.SendMessages),
    setPermissions: vi.fn(async () => {}),
  };
}

function textChannel(id) {
  return {
    id,
    type: ChannelType.GuildText,
    permissionOverwrites: { cache: new Map(), edit: vi.fn(async () => {}) },
  };
}

function fakeGuild({ channels = [], everyone = everyoneRole(), features = [] } = {}) {
  const chCache = new Map(channels.map((c) => [c.id, c]));
  return {
    features,
    verificationLevel: GuildVerificationLevel.Low,
    roles: { everyone, cache: new Map([["everyone", everyone]]) },
    channels: { cache: chCache },
    setVerificationLevel: vi.fn(async () => {}),
    disableInvites: vi.fn(async () => {}),
  };
}

describe("tiers", () => {
  it("panic strips SendMessages from @everyone and snapshots the prior bit", async () => {
    const guild = fakeGuild();
    const res = await applyPanic(guild, { reason: "raid" });
    expect(guild.roles.everyone.setPermissions).toHaveBeenCalled();
    expect(res.snapshots).toEqual([
      {
        targetType: "role",
        channelId: null,
        targetId: "everyone",
        field: "SendMessages",
        priorAllow: true,
        priorDeny: false,
        addedByUs: false,
      },
    ]);
  });

  it("channels denies @everyone and adds a staff-bypass allow flagged addedByUs", async () => {
    const c1 = textChannel("c1");
    const guild = fakeGuild({ channels: [c1] });
    const res = await applyChannels(guild, {
      channelIds: ["c1"],
      modRoleIds: ["mod"],
      reason: "raid",
    });

    // @everyone denied
    expect(c1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "everyone",
      { SendMessages: false },
      { reason: "raid" },
    );
    // mod role allowed
    expect(c1.permissionOverwrites.edit).toHaveBeenCalledWith(
      "mod",
      { SendMessages: true },
      { reason: "raid" },
    );
    // staff-bypass snapshot is flagged addedByUs (prior was neutral)
    const modSnap = res.snapshots.find((s) => s.targetId === "mod");
    expect(modSnap.addedByUs).toBe(true);
    expect(res.failed).toEqual([]);
  });

  it("channels records a failure but keeps other channels", async () => {
    const good = textChannel("good");
    const bad = textChannel("bad");
    bad.permissionOverwrites.edit = vi.fn(async () => {
      throw new Error("Missing Permissions");
    });
    const guild = fakeGuild({ channels: [good, bad] });
    const res = await applyChannels(guild, {
      channelIds: ["good", "bad"],
      modRoleIds: [],
      reason: "raid",
    });
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].item).toBe("bad");
    expect(res.snapshots.some((s) => s.channelId === "good")).toBe(true);
  });

  it("invites pauses only if not already paused", async () => {
    const off = fakeGuild({ features: [] });
    expect((await applyInvites(off, { reason: "x" })).invitesPausedByUs).toBe(true);
    expect(off.disableInvites).toHaveBeenCalledWith(true);

    const already = fakeGuild({ features: ["INVITES_DISABLED"] });
    expect((await applyInvites(already, { reason: "x" })).invitesPausedByUs).toBe(false);
    expect(already.disableInvites).not.toHaveBeenCalled();
  });

  it("joins raises verification to VeryHigh and records prior", async () => {
    const guild = fakeGuild();
    const res = await applyJoins(guild, { reason: "x" });
    expect(res.priorVerificationLevel).toBe(GuildVerificationLevel.Low);
    expect(guild.setVerificationLevel).toHaveBeenCalledWith(
      GuildVerificationLevel.VeryHigh,
      "x",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/tiers.test.js`
Expected: FAIL — cannot resolve `tiers.js`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/lockdown/tiers.js`:

```js
import { ChannelType, GuildVerificationLevel } from "discord.js";
import { snapshotChannelField, snapshotRolePerm, readOverwrite } from "./snapshot.js";
import { runBatched } from "./batch.js";

const TEXT_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);
const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

export function textChannelIds(guild) {
  return [...guild.channels.cache.values()].filter((c) => TEXT_TYPES.has(c.type)).map((c) => c.id);
}

export function voiceChannelIds(guild) {
  return [...guild.channels.cache.values()].filter((c) => VOICE_TYPES.has(c.type)).map((c) => c.id);
}

// panic: one API call, strip SendMessages from the @everyone role guild-wide.
export async function applyPanic(guild, { reason }) {
  const everyone = guild.roles.everyone;
  const snapshot = snapshotRolePerm(everyone, "SendMessages");
  const { PermissionsBitField } = await import("discord.js");
  const next = everyone.permissions.remove(PermissionsBitField.Flags.SendMessages);
  await everyone.setPermissions(next, reason);
  return { snapshots: [snapshot] };
}

// Shared overwrite-deny logic for channels/voice tiers.
async function applyOverwriteDeny(guild, { channelIds, modRoleIds, fields, reason, onProgress }) {
  const snapshots = [];
  const worker = async (channelId) => {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) throw new Error(`channel ${channelId} not found`);

    for (const field of fields) {
      snapshots.push(snapshotChannelField(channel, guild.roles.everyone.id, field));
    }
    await channel.permissionOverwrites.edit(
      guild.roles.everyone.id,
      Object.fromEntries(fields.map((f) => [f, false])),
      { reason },
    );

    // staff bypass: ensure mod roles keep an explicit allow so staff can coordinate
    for (const roleId of modRoleIds) {
      const rows = fields.map((field) => {
        const snap = snapshotChannelField(channel, roleId, field);
        const prior = readOverwrite(channel, roleId, field);
        snap.addedByUs = !prior.priorAllow; // we granted an allow it didn't already have
        return snap;
      });
      snapshots.push(...rows);
      await channel.permissionOverwrites.edit(
        roleId,
        Object.fromEntries(fields.map((f) => [f, true])),
        { reason },
      );
    }
  };

  const { failed } = await runBatched(channelIds, worker, { concurrency: 6, onProgress });
  return { snapshots, failed };
}

export function applyChannels(guild, { channelIds, modRoleIds, reason, onProgress }) {
  return applyOverwriteDeny(guild, {
    channelIds,
    modRoleIds,
    fields: ["SendMessages"],
    reason,
    onProgress,
  });
}

export function applyVoice(guild, { channelIds, modRoleIds, reason, onProgress }) {
  return applyOverwriteDeny(guild, {
    channelIds,
    modRoleIds,
    fields: ["Connect", "Speak"],
    reason,
    onProgress,
  });
}

// invites: flag only. Never delete invite links.
export async function applyInvites(guild, { reason }) {
  if (guild.features.includes("INVITES_DISABLED")) return { invitesPausedByUs: false };
  await guild.disableInvites(true, reason);
  return { invitesPausedByUs: true };
}

// joins: raise verification to max, record prior.
export async function applyJoins(guild, { reason }) {
  const priorVerificationLevel = guild.verificationLevel;
  await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, reason);
  return { priorVerificationLevel };
}
```

Note: `applyPanic`'s dynamic `import("discord.js")` avoids a top-level import only needed there; if you prefer, hoist `import { PermissionsBitField } from "discord.js"` to the top and drop the dynamic import. Either is fine — keep it consistent with the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/tiers.test.js`
Expected: PASS (6 tests). If `applyPanic`'s dynamic import complains, hoist the static import per the note.

- [ ] **Step 5: Commit**

```bash
git add src/modules/lockdown/tiers.js test/modules/lockdown/tiers.test.js
git commit -m "feat(lockdown): per-tier apply functions with staff bypass"
```

---

## Task 5: LockdownService (start / unlock / status / idempotency / partial failure)

**Files:**
- Create: `src/modules/lockdown/LockdownService.js`
- Test: `test/modules/lockdown/LockdownService.test.js`

**Interfaces:**
- Consumes: `tiers.js` (all apply fns + `textChannelIds`/`voiceChannelIds`), `snapshot.js` (`restoreRow`).
- Produces (class `LockdownService`, constructed `new LockdownService({ prisma, logger, cases })`):
  - `getActive(guildId) → Promise<state | null>` (includes `snapshots`)
  - `start({ guild, tier, durationMs = null, reason, actorId, channelIds = null, modRoleIds = [], onProgress }) → Promise<{ ok, alreadyActive?, state?, failed?, counts? }>`
  - `unlock({ guild, actorId, reason = "Lockdown lifted" }) → Promise<{ ok, reason?, state?, failed?, counts? }>` where `reason` values on failure are `"none"` | `"corrupt"`
  - `panic(guild, { reason, actorId }) → Promise` (delegates to `start` with tier `"panic"`)
  - `status(guildId) → Promise<state | null>`
  - `TIERS` set: `{ panic, channels, invites, joins, voice, full }`

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/LockdownService.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { ChannelType, GuildVerificationLevel, PermissionsBitField } from "discord.js";
import { LockdownService } from "../../../src/modules/lockdown/LockdownService.js";

// In-memory prisma double for LockdownState/LockdownSnapshot.
function fakePrisma(seed = {}) {
  const states = new Map(); // guildId -> state (with snapshots array)
  if (seed.state) states.set(seed.state.guildId, seed.state);
  let idc = 0;
  return {
    _states: states,
    lockdownState: {
      findUnique: vi.fn(async ({ where }) => {
        const s = where.guildId ? states.get(where.guildId) : [...states.values()].find((x) => x.id === where.id);
        return s ?? null;
      }),
      findMany: vi.fn(async ({ where }) => {
        return [...states.values()].filter(
          (s) => s.status === (where.status ?? s.status) && (!where.expiresAt || (s.expiresAt && s.expiresAt <= where.expiresAt.lte)),
        );
      }),
      create: vi.fn(async ({ data }) => {
        const state = { id: `L${++idc}`, snapshots: [], ...data };
        states.set(data.guildId, state);
        return state;
      }),
      update: vi.fn(async ({ where, data }) => {
        const s = [...states.values()].find((x) => x.id === where.id) ?? states.get(where.guildId);
        Object.assign(s, data);
        return s;
      }),
    },
    lockdownSnapshot: {
      createMany: vi.fn(async ({ data }) => {
        const s = [...states.values()].find((x) => x.id === data[0]?.lockdownId);
        if (s) s.snapshots.push(...data);
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const s = [...states.values()].find((x) => x.id === where.lockdownId);
        if (s) s.snapshots = [];
        return { count: 0 };
      }),
    },
  };
}

function fakeCases() {
  let n = 0;
  return { createCase: vi.fn(async (d) => ({ caseNumber: ++n, ...d })) };
}

function textChannel(id, editImpl) {
  return {
    id,
    type: ChannelType.GuildText,
    permissionOverwrites: {
      cache: new Map(),
      edit: editImpl ?? vi.fn(async () => {}),
    },
  };
}

function fakeGuild({ id = "g1", channels = [] } = {}) {
  const everyone = {
    id: "everyone",
    permissions: new PermissionsBitField(PermissionsBitField.Flags.SendMessages),
    setPermissions: vi.fn(async () => {}),
  };
  const cache = new Map(channels.map((c) => [c.id, c]));
  return {
    id,
    features: [],
    verificationLevel: GuildVerificationLevel.Low,
    roles: { everyone, cache: new Map([["everyone", everyone]]) },
    channels: { cache },
    setVerificationLevel: vi.fn(async () => {}),
    disableInvites: vi.fn(async () => {}),
  };
}

describe("LockdownService", () => {
  it("channels lock persists state + snapshots and creates a case", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const guild = fakeGuild({ channels: [textChannel("c1")] });

    const res = await svc.start({
      guild,
      tier: "channels",
      reason: "raid",
      actorId: "admin",
      modRoleIds: [],
    });

    expect(res.ok).toBe(true);
    expect(prisma.lockdownState.create).toHaveBeenCalled();
    expect(prisma.lockdownSnapshot.createMany).toHaveBeenCalled();
    const state = prisma._states.get("g1");
    expect(state.snapshots.some((s) => s.channelId === "c1")).toBe(true);
  });

  it("is idempotent: a second start while active does not re-snapshot", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const guild = fakeGuild({ channels: [textChannel("c1")] });
    await svc.start({ guild, tier: "channels", reason: "r", actorId: "a", modRoleIds: [] });

    prisma.lockdownSnapshot.createMany.mockClear();
    const second = await svc.start({ guild, tier: "channels", reason: "r", actorId: "a", modRoleIds: [] });

    expect(second.ok).toBe(false);
    expect(second.alreadyActive).toBe(true);
    expect(prisma.lockdownSnapshot.createMany).not.toHaveBeenCalled();
  });

  it("restores exactly from DB after a simulated restart (no in-memory state)", async () => {
    // Pre-seed a persisted lockdown as if the process just restarted.
    const editSpy = vi.fn(async () => {});
    const guild = fakeGuild({ channels: [textChannel("c1", editSpy)] });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshots: [
          {
            targetType: "channel",
            channelId: "c1",
            targetId: "everyone",
            field: "SendMessages",
            priorAllow: false,
            priorDeny: false, // was neutral
            addedByUs: false,
          },
        ],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });

    const res = await svc.unlock({ guild, actorId: "admin" });

    expect(res.ok).toBe(true);
    // neutral restored to null, NOT allow
    expect(editSpy).toHaveBeenCalledWith("everyone", { SendMessages: null }, { reason: "Lockdown lifted" });
    expect(prisma.lockdownState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lifted" }) }),
    );
  });

  it("refuses to unlock when there is no active lockdown", async () => {
    const prisma = fakePrisma();
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const res = await svc.unlock({ guild: fakeGuild(), actorId: "a" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("none");
  });

  it("refuses to unlock a corrupt snapshot set instead of guessing", async () => {
    const prisma = fakePrisma({
      state: { id: "L1", guildId: "g1", tier: "channels", status: "active", snapshots: [] },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    const res = await svc.unlock({ guild: fakeGuild(), actorId: "a" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("corrupt");
    // state left intact for the admin to inspect
    expect(prisma.lockdownState.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lifted" }) }),
    );
  });

  it("partial-failure unlock restores the good channel and keeps snapshots", async () => {
    const goodEdit = vi.fn(async () => {});
    const badEdit = vi.fn(async () => {
      throw new Error("Missing Permissions");
    });
    const guild = fakeGuild({
      channels: [textChannel("good", goodEdit), textChannel("bad", badEdit)],
    });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshots: [
          { targetType: "channel", channelId: "good", targetId: "everyone", field: "SendMessages", priorAllow: false, priorDeny: false, addedByUs: false },
          { targetType: "channel", channelId: "bad", targetId: "everyone", field: "SendMessages", priorAllow: false, priorDeny: false, addedByUs: false },
        ],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });

    const res = await svc.unlock({ guild, actorId: "admin" });

    expect(goodEdit).toHaveBeenCalled();
    expect(res.failed).toHaveLength(1);
    // partial failure -> snapshots NOT deleted, still restorable
    expect(prisma.lockdownSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it("staff-bypass allow is removed on unlock only where addedByUs", async () => {
    const editSpy = vi.fn(async () => {});
    const guild = fakeGuild({ channels: [textChannel("c1", editSpy)] });
    const prisma = fakePrisma({
      state: {
        id: "L1",
        guildId: "g1",
        tier: "channels",
        status: "active",
        invitesPausedByUs: false,
        priorVerificationLevel: null,
        snapshots: [
          { targetType: "channel", channelId: "c1", targetId: "everyone", field: "SendMessages", priorAllow: false, priorDeny: false, addedByUs: false },
          { targetType: "channel", channelId: "c1", targetId: "modAdded", field: "SendMessages", priorAllow: false, priorDeny: false, addedByUs: true },
          { targetType: "channel", channelId: "c1", targetId: "modHad", field: "SendMessages", priorAllow: true, priorDeny: false, addedByUs: false },
        ],
      },
    });
    const svc = new LockdownService({ prisma, logger: console, cases: fakeCases() });
    await svc.unlock({ guild, actorId: "admin" });

    // addedByUs -> restored to null (removed)
    expect(editSpy).toHaveBeenCalledWith("modAdded", { SendMessages: null }, { reason: "Lockdown lifted" });
    // pre-existing allow -> restored to allow (kept)
    expect(editSpy).toHaveBeenCalledWith("modHad", { SendMessages: true }, { reason: "Lockdown lifted" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/LockdownService.test.js`
Expected: FAIL — cannot resolve `LockdownService.js`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/lockdown/LockdownService.js`:

```js
import { GuildVerificationLevel } from "discord.js";
import {
  applyPanic,
  applyChannels,
  applyVoice,
  applyInvites,
  applyJoins,
  textChannelIds,
  voiceChannelIds,
} from "./tiers.js";
import { restoreRow } from "./snapshot.js";

export const TIERS = new Set(["panic", "channels", "invites", "joins", "voice", "full"]);

// Which sub-tiers `full` runs, in order (fastest protection first).
const FULL_ORDER = ["panic", "channels", "invites", "joins", "voice"];

export class LockdownService {
  constructor({ prisma, logger, cases }) {
    this.prisma = prisma;
    this.logger = logger;
    this.cases = cases;
  }

  getActive(guildId) {
    return this.prisma.lockdownState.findUnique({
      where: { guildId },
      include: { snapshots: true },
    });
  }

  status(guildId) {
    return this.getActive(guildId).then((s) => (s && s.status === "active" ? s : null));
  }

  panic(guild, { reason, actorId }) {
    return this.start({ guild, tier: "panic", reason, actorId, modRoleIds: [] });
  }

  // Run one sub-tier and fold its result into the accumulator.
  async #applyTier(tier, guild, opts, acc) {
    if (tier === "panic") {
      const { snapshots } = await applyPanic(guild, opts);
      acc.snapshots.push(...snapshots);
    } else if (tier === "channels") {
      const ids = opts.channelIds ?? textChannelIds(guild);
      const { snapshots, failed } = await applyChannels(guild, { ...opts, channelIds: ids });
      acc.snapshots.push(...snapshots);
      acc.failed.push(...failed);
    } else if (tier === "voice") {
      const ids = voiceChannelIds(guild);
      const { snapshots, failed } = await applyVoice(guild, { ...opts, channelIds: ids });
      acc.snapshots.push(...snapshots);
      acc.failed.push(...failed);
    } else if (tier === "invites") {
      const { invitesPausedByUs } = await applyInvites(guild, opts);
      acc.invitesPausedByUs = acc.invitesPausedByUs || invitesPausedByUs;
    } else if (tier === "joins") {
      const { priorVerificationLevel } = await applyJoins(guild, opts);
      acc.priorVerificationLevel = priorVerificationLevel;
    }
  }

  async start({
    guild,
    tier,
    durationMs = null,
    reason = "No reason provided",
    actorId,
    channelIds = null,
    modRoleIds = [],
    onProgress,
  }) {
    if (!TIERS.has(tier)) throw new Error(`unknown tier: ${tier}`);

    // Idempotent: never clobber a live snapshot with the already-locked state.
    const existing = await this.getActive(guild.id);
    if (existing && existing.status === "active") {
      return { ok: false, alreadyActive: true, state: existing };
    }

    const acc = {
      snapshots: [],
      failed: [],
      invitesPausedByUs: false,
      priorVerificationLevel: null,
    };
    const opts = { reason, channelIds, modRoleIds, onProgress };
    const order = tier === "full" ? FULL_ORDER : [tier];
    for (const t of order) {
      await this.#applyTier(t, guild, opts, acc);
    }

    const state = await this.prisma.lockdownState.create({
      data: {
        guildId: guild.id,
        tier,
        reason,
        startedById: actorId,
        expiresAt: durationMs ? new Date(Date.now() + durationMs) : null,
        priorVerificationLevel: acc.priorVerificationLevel,
        invitesPausedByUs: acc.invitesPausedByUs,
        status: "active",
      },
    });

    if (acc.snapshots.length > 0) {
      await this.prisma.lockdownSnapshot.createMany({
        data: acc.snapshots.map((s) => ({ ...s, lockdownId: state.id })),
      });
    }

    let record = null;
    if (this.cases) {
      record = await this.cases.createCase({
        guildId: guild.id,
        type: "lockdown",
        targetId: actorId,
        moderatorId: actorId,
        reason: `[${tier}] ${reason}`,
      });
      await this.prisma.lockdownState.update({
        where: { id: state.id },
        data: { caseNumber: record.caseNumber },
      });
    }

    return {
      ok: true,
      state,
      failed: acc.failed,
      counts: { snapshots: acc.snapshots.length, failed: acc.failed.length },
      caseNumber: record?.caseNumber ?? null,
    };
  }

  async unlock({ guild, actorId, reason = "Lockdown lifted" }) {
    const state = await this.getActive(guild.id);
    if (!state || state.status !== "active") return { ok: false, reason: "none" };

    const snapshots = state.snapshots ?? [];
    // A tier that must have overwrite/role snapshots but has none is corrupt —
    // refuse rather than guess. (invites/joins carry state fields, not snapshots.)
    const needsSnapshots = ["panic", "channels", "voice", "full"].includes(state.tier);
    if (needsSnapshots && snapshots.length === 0) {
      this.logger?.error?.({ guildId: guild.id, tier: state.tier }, "lockdown snapshot missing/corrupt");
      return { ok: false, reason: "corrupt", state };
    }

    const failed = [];
    for (const row of snapshots) {
      try {
        await restoreRow(guild, row, reason);
      } catch (error) {
        failed.push({ item: row.channelId ?? row.targetId, error });
      }
    }

    // Restore guild-level effects.
    if (state.priorVerificationLevel != null) {
      await guild
        .setVerificationLevel(state.priorVerificationLevel, reason)
        .catch((error) => failed.push({ item: "verificationLevel", error }));
    }
    if (state.invitesPausedByUs) {
      await guild
        .disableInvites(false, reason)
        .catch((error) => failed.push({ item: "invites", error }));
    }

    if (failed.length > 0) {
      // Partial failure: keep snapshots so the admin can re-run /unlockserver.
      this.logger?.warn?.({ guildId: guild.id, failed: failed.length }, "partial unlock");
      await this.prisma.lockdownState.update({
        where: { id: state.id },
        data: { status: "active" },
      });
      return { ok: false, reason: "partial", state, failed };
    }

    await this.prisma.lockdownState.update({
      where: { id: state.id },
      data: { status: "lifted" },
    });
    await this.prisma.lockdownSnapshot.deleteMany({ where: { lockdownId: state.id } });

    if (this.cases) {
      await this.cases.createCase({
        guildId: guild.id,
        type: "unlockserver",
        targetId: actorId,
        moderatorId: actorId,
        reason,
      });
    }

    return { ok: true, state, failed: [], counts: { restored: snapshots.length } };
  }
}
```

Note: `GuildVerificationLevel` is imported for clarity/consumers even though the numeric prior level is used directly; keep the import if you reference the enum in follow-up tasks, otherwise Prettier/eslint may flag it as unused — drop it if so.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/LockdownService.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/lockdown/LockdownService.js test/modules/lockdown/LockdownService.test.js
git commit -m "feat(lockdown): LockdownService with idempotency, restart-safe restore, partial-failure handling"
```

---

## Task 6: Expiry sweep (rides the existing mod-expiry job)

**Files:**
- Create: `src/modules/lockdown/sweep.js`
- Modify: `src/modules/moderation/expiry.js` (call the lockdown sweep from the same once-per-minute job)
- Test: `test/modules/lockdown/sweep.test.js`

**Interfaces:**
- Consumes: `LockdownService.unlock`, `prisma.lockdownState.findMany`.
- Produces: `sweepExpiredLockdowns({ client, lockdown, prisma, logger, now = new Date() }) → Promise<number>` (count unlocked).

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/sweep.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { sweepExpiredLockdowns } from "../../../src/modules/lockdown/sweep.js";

describe("sweepExpiredLockdowns", () => {
  it("unlocks an expired lockdown exactly once", async () => {
    const past = new Date(Date.now() - 60_000);
    const due = [{ id: "L1", guildId: "g1", expiresAt: past, status: "active" }];
    const prisma = {
      lockdownState: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(due) // first sweep finds it
          .mockResolvedValueOnce([]), // second finds nothing (now lifted)
      },
    };
    const guild = { id: "g1" };
    const client = { guilds: { cache: new Map([["g1", guild]]) } };
    const unlock = vi.fn(async () => ({ ok: true }));
    const lockdown = { unlock };

    const first = await sweepExpiredLockdowns({ client, lockdown, prisma, logger: console });
    expect(first).toBe(1);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith(
      expect.objectContaining({ guild, actorId: expect.any(String) }),
    );

    const second = await sweepExpiredLockdowns({ client, lockdown, prisma, logger: console });
    expect(second).toBe(0);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("skips guilds the shard cannot see", async () => {
    const past = new Date(Date.now() - 60_000);
    const prisma = {
      lockdownState: {
        findMany: vi.fn(async () => [{ id: "L1", guildId: "ghost", expiresAt: past, status: "active" }]),
      },
    };
    const client = { guilds: { cache: new Map() } };
    const unlock = vi.fn(async () => ({ ok: true }));
    const count = await sweepExpiredLockdowns({ client, lockdown: { unlock }, prisma, logger: console });
    expect(count).toBe(0);
    expect(unlock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/sweep.test.js`
Expected: FAIL — cannot resolve `sweep.js`.

- [ ] **Step 3: Write the sweep**

Create `src/modules/lockdown/sweep.js`:

```js
// Auto-unlock expired lockdowns. Rides the existing once-per-minute mod-expiry
// job (see src/modules/moderation/expiry.js) — no separate scheduler.
export async function sweepExpiredLockdowns({ client, lockdown, prisma, logger, now = new Date() }) {
  const due = await prisma.lockdownState.findMany({
    where: { status: "active", expiresAt: { not: null, lte: now } },
  });

  let unlocked = 0;
  for (const state of due) {
    const guild = client.guilds.cache.get(state.guildId);
    if (!guild) continue; // another shard owns it, or the bot was removed
    try {
      const res = await lockdown.unlock({ guild, actorId: "system", reason: "Lockdown expired" });
      if (res.ok) unlocked++;
    } catch (err) {
      logger?.error?.({ err, guildId: state.guildId }, "failed to auto-unlock expired lockdown");
    }
  }
  if (unlocked > 0) logger?.info?.({ count: unlocked }, "auto-unlocked expired lockdowns");
  return unlocked;
}
```

- [ ] **Step 4: Wire it into the existing mod-expiry job**

Modify `src/modules/moderation/expiry.js` — extend the single registered job to also sweep lockdowns. Replace the file with:

```js
import { sweepExpiredLockdowns } from "../lockdown/sweep.js";

export async function sweepExpired({ client, caseService, logger, now = new Date() }) {
  const due = await caseService.dueExpired(now);
  for (const record of due) {
    try {
      const guild = client.guilds.cache.get(record.guildId);
      if (guild) {
        await guild.bans.remove(record.targetId, "Temp ban expired").catch(() => {});
      }
      await caseService.deactivate(record.id);
    } catch (err) {
      logger.error({ err, caseId: record.id }, "failed to lift expired temp ban");
    }
  }
  if (due.length > 0) logger.info?.({ count: due.length }, "processed expired temp bans");
  return due.length;
}

export function registerExpiryJob(context) {
  context.scheduler.every("* * * * *", "mod-expiry", async () => {
    await sweepExpired({
      client: context.client,
      caseService: context.cases,
      logger: context.logger,
    });
    if (context.lockdown) {
      await sweepExpiredLockdowns({
        client: context.client,
        lockdown: context.lockdown,
        prisma: context.prisma,
        logger: context.logger,
      });
    }
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/modules/lockdown/sweep.test.js test/core/Scheduler.test.js`
Expected: PASS (existing Scheduler tests still green; new sweep tests green).

- [ ] **Step 6: Commit**

```bash
git add src/modules/lockdown/sweep.js src/modules/moderation/expiry.js test/modules/lockdown/sweep.test.js
git commit -m "feat(lockdown): auto-unlock expired lockdowns via the existing mod-expiry sweep"
```

---

## Task 7: Embeds + log dispatch

**Files:**
- Create: `src/modules/lockdown/embeds.js`
- Create: `src/modules/lockdown/logging.js`
- Test: `test/modules/lockdown/embeds.test.js`

**Interfaces:**
- Consumes: `src/lib/embeds.js` (`brandEmbed`), `src/lib/constants.js` (`COLORS`), `src/lib/duration.js` (`formatDuration`), `src/modules/logging/dispatcher.js` (`logEvent`), `src/modules/antinuke/alert.js` pattern for the alert channel.
- Produces:
  - `lockResultEmbed({ tier, reason, actorId, durationMs, counts, failed }) → EmbedBuilder`
  - `unlockResultEmbed({ actorId, counts, failed }) → EmbedBuilder`
  - `statusEmbed(state) → EmbedBuilder`  (state may be null → "no active lockdown")
  - `emitLockdownLog(ctx, guild, embed, { alertChannelId }) → Promise<void>` (posts to `modActions` category and, if set, the anti-nuke alert channel)

- [ ] **Step 1: Write the failing test**

Create `test/modules/lockdown/embeds.test.js`:

```js
import { describe, it, expect } from "vitest";
import { lockResultEmbed, statusEmbed } from "../../../src/modules/lockdown/embeds.js";

describe("lockdown embeds", () => {
  it("lock result shows tier, actor, and failure count", () => {
    const e = lockResultEmbed({
      tier: "channels",
      reason: "raid",
      actorId: "admin",
      durationMs: 3_600_000,
      counts: { snapshots: 10, failed: 2 },
      failed: [{ item: "bad", error: new Error("x") }, { item: "bad2", error: new Error("y") }],
    }).toJSON();
    const text = JSON.stringify(e);
    expect(text).toContain("channels");
    expect(text).toContain("admin");
    expect(text).toContain("2"); // failed count surfaced
  });

  it("status embed reports no active lockdown when state is null", () => {
    const e = statusEmbed(null).toJSON();
    expect(JSON.stringify(e).toLowerCase()).toContain("no active");
  });

  it("status embed reports the active tier", () => {
    const e = statusEmbed({
      tier: "full",
      reason: "raid",
      startedById: "admin",
      startedAt: new Date(),
      expiresAt: null,
      invitesPausedByUs: true,
      status: "active",
    }).toJSON();
    expect(JSON.stringify(e)).toContain("full");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/embeds.test.js`
Expected: FAIL — cannot resolve `embeds.js`.

- [ ] **Step 3: Write embeds.js**

Create `src/modules/lockdown/embeds.js`:

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { brandEmbed } from "../../lib/embeds.js";
import { formatDuration } from "../../lib/duration.js";

function failList(failed = []) {
  if (!failed.length) return null;
  const items = failed.slice(0, 10).map((f) => `\`${f.item}\``).join(", ");
  const more = failed.length > 10 ? ` (+${failed.length - 10} more)` : "";
  return `${items}${more}`;
}

export function lockResultEmbed({ tier, reason, actorId, durationMs, counts = {}, failed = [] }) {
  const fields = [
    { name: "Tier", value: `\`${tier}\``, inline: true },
    { name: "By", value: `<@${actorId}>`, inline: true },
    { name: "Duration", value: durationMs ? formatDuration(durationMs) : "until unlocked", inline: true },
    { name: "Reason", value: reason ?? "No reason provided" },
  ];
  if (counts.snapshots != null) {
    fields.push({ name: "Overwrites touched", value: String(counts.snapshots), inline: true });
  }
  const fail = failList(failed);
  if (fail) fields.push({ name: `Failed (${failed.length})`, value: fail });

  return new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle("🔒 Server locked down")
    .addFields(fields)
    .setTimestamp();
}

export function unlockResultEmbed({ actorId, counts = {}, failed = [] }) {
  const fields = [
    { name: "By", value: `<@${actorId}>`, inline: true },
    { name: "Restored", value: String(counts.restored ?? 0), inline: true },
  ];
  const fail = failList(failed);
  if (fail) fields.push({ name: `Failed (${failed.length})`, value: fail });
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("🔓 Lockdown lifted")
    .addFields(fields)
    .setTimestamp();
}

export function statusEmbed(state) {
  if (!state || state.status !== "active") {
    return brandEmbed({ title: "Lockdown status", description: "✅ No active lockdown." });
  }
  const expires = state.expiresAt
    ? `<t:${Math.floor(new Date(state.expiresAt).getTime() / 1000)}:R>`
    : "manual (no expiry)";
  return brandEmbed({
    title: "🔒 Lockdown active",
    fields: [
      { name: "Tier", value: `\`${state.tier}\``, inline: true },
      { name: "By", value: `<@${state.startedById}>`, inline: true },
      { name: "Expires", value: expires, inline: true },
      { name: "Started", value: `<t:${Math.floor(new Date(state.startedAt).getTime() / 1000)}:f>`, inline: true },
      { name: "Invites paused", value: state.invitesPausedByUs ? "yes (by us)" : "no", inline: true },
      { name: "Reason", value: state.reason ?? "No reason provided" },
    ],
  });
}
```

- [ ] **Step 4: Write logging.js**

Create `src/modules/lockdown/logging.js`:

```js
import { logEvent } from "../logging/dispatcher.js";

// Emit a lockdown embed to the moderation logging category and, when configured,
// the anti-nuke alert channel.
export async function emitLockdownLog(ctx, guild, embed, { alertChannelId } = {}) {
  await logEvent(ctx, guild, "modActions", embed).catch((err) =>
    ctx.logger?.error?.({ err }, "lockdown modActions log failed"),
  );
  if (alertChannelId) {
    try {
      const channel = await guild.channels.fetch(alertChannelId);
      if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
    } catch (err) {
      ctx.logger?.error?.({ err, alertChannelId }, "lockdown alert-channel log failed");
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/embeds.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/lockdown/embeds.js src/modules/lockdown/logging.js test/modules/lockdown/embeds.test.js
git commit -m "feat(lockdown): result/status embeds and dual-channel log dispatch"
```

---

## Task 8: Slash commands (/lockserver + /unlockserver)

**Files:**
- Create: `src/modules/lockdown/commands/lockserver.js`
- Create: `src/modules/lockdown/commands/unlockserver.js`
- Test: `test/modules/lockdown/commands.test.js`

**Interfaces:**
- Consumes: `ctx.lockdown` (LockdownService), `ctx.config.getGuild` (mod roles + antinuke alert channel), `src/lib/duration.js`, `embeds.js`, `logging.js`.
- Produces: two default-exported command modules with `data`, `permissions`, `execute(interaction, ctx)`.

- [ ] **Step 1: Write the failing test (command metadata + already-active reply)**

Create `test/modules/lockdown/commands.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import lockserver from "../../../src/modules/lockdown/commands/lockserver.js";
import unlockserver from "../../../src/modules/lockdown/commands/unlockserver.js";

describe("lockserver command metadata", () => {
  it("registers subcommands and requires ManageGuild/Administrator", () => {
    const json = lockserver.data.toJSON();
    expect(json.name).toBe("lockserver");
    const subs = json.options.map((o) => o.name).sort();
    expect(subs).toEqual(["channels", "full", "invites", "joins", "panic", "status", "voice"]);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.Administrator);
    expect(lockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });

  it("unlockserver is named and gated the same way", () => {
    expect(unlockserver.data.toJSON().name).toBe("unlockserver");
    expect(unlockserver.permissions).toContain(PermissionFlagsBits.ManageGuild);
  });
});

describe("lockserver status subcommand", () => {
  it("replies with status without starting a lockdown", async () => {
    const reply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: { getSubcommand: () => "status", getString: () => null },
      user: { id: "admin" },
      reply,
    };
    const ctx = {
      logger: console,
      lockdown: { status: vi.fn(async () => null), start: vi.fn() },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    expect(ctx.lockdown.status).toHaveBeenCalledWith("g1");
    expect(ctx.lockdown.start).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });

  it("a tier subcommand that is already active reports status, does not re-lock", async () => {
    const reply = vi.fn(async () => {});
    const deferReply = vi.fn(async () => {});
    const editReply = vi.fn(async () => {});
    const interaction = {
      guildId: "g1",
      guild: { id: "g1" },
      options: {
        getSubcommand: () => "channels",
        getString: (n) => (n === "reason" ? "raid" : null),
        getChannel: () => null,
      },
      user: { id: "admin" },
      reply,
      deferReply,
      editReply,
    };
    const active = { tier: "channels", status: "active", startedById: "admin", startedAt: new Date(), reason: "r" };
    const ctx = {
      logger: console,
      lockdown: {
        status: vi.fn(async () => active),
        start: vi.fn(async () => ({ ok: false, alreadyActive: true, state: active })),
      },
      config: { getGuild: vi.fn(async () => ({ modRoles: [], antinuke: null })) },
    };
    await lockserver.execute(interaction, ctx);
    // reported without a successful lock log
    expect(reply).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/lockdown/commands.test.js`
Expected: FAIL — cannot resolve command modules.

- [ ] **Step 3: Write lockserver.js**

Create `src/modules/lockdown/commands/lockserver.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { parseDuration } from "../../../lib/duration.js";
import { errorEmbed, warnEmbed } from "../../../lib/embeds.js";
import { lockResultEmbed, statusEmbed } from "../embeds.js";
import { emitLockdownLog } from "../logging.js";

const TIER_SUBS = ["panic", "channels", "invites", "joins", "voice", "full"];

function tierSub(sub, name, desc, { withChannels = false } = {}) {
  sub.setName(name).setDescription(desc);
  if (withChannels) {
    sub.addChannelOption((o) =>
      o
        .setName("channels")
        .setDescription("Limit to specific channels (optional)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
    );
  }
  sub.addStringOption((o) => o.setName("duration").setDescription("e.g. 30m, 2h (optional)"));
  sub.addStringOption((o) => o.setName("reason").setDescription("Reason (optional)"));
  return sub;
}

export default {
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("lockserver")
      .setDescription("Server-wide lockdown with exact-state restore.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
    b.addSubcommand((s) => tierSub(s, "panic", "Instantly strip @everyone SendMessages guild-wide."));
    b.addSubcommand((s) => tierSub(s, "channels", "Deny sending across text channels.", { withChannels: true }));
    b.addSubcommand((s) => tierSub(s, "invites", "Pause server invites (no links deleted)."));
    b.addSubcommand((s) => tierSub(s, "joins", "Raise verification to maximum."));
    b.addSubcommand((s) => tierSub(s, "voice", "Deny Connect/Speak on voice channels."));
    b.addSubcommand((s) => tierSub(s, "full", "panic + channels + invites + joins + voice."));
    b.addSubcommand((s) => s.setName("status").setDescription("Show the current lockdown state."));
    return b;
  })(),
  permissions: [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild],
  cooldown: 5,
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === "status") {
      const state = await ctx.lockdown.status(interaction.guildId);
      await interaction.reply({ embeds: [statusEmbed(state)], ephemeral: true });
      return;
    }

    if (!TIER_SUBS.includes(sub)) {
      await interaction.reply({ embeds: [errorEmbed("Unknown tier.")], ephemeral: true });
      return;
    }

    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    let durationMs = null;
    if (durationStr) {
      durationMs = parseDuration(durationStr);
      if (!durationMs) {
        await interaction.reply({
          embeds: [errorEmbed("Invalid duration. Try `30m`, `2h`.")],
          ephemeral: true,
        });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    const modRoleIds = guildConfig.modRoles?.map((r) => r.roleId) ?? [];
    const alertChannelId = guildConfig.antinuke?.alertChannelId ?? null;

    const channelOpt = sub === "channels" ? interaction.options.getChannel("channels") : null;
    const channelIds = channelOpt ? [channelOpt.id] : null;

    await interaction.deferReply();

    let progressAt = 0;
    const onProgress = (done, total) => {
      const now = Date.now();
      if (now - progressAt < 750 && done < total) return; // throttle edits
      progressAt = now;
      interaction
        .editReply({ embeds: [warnEmbed(`Locking… ${done}/${total} channels`)] })
        .catch(() => {});
    };

    const res = await ctx.lockdown.start({
      guild: interaction.guild,
      tier: sub,
      durationMs,
      reason,
      actorId: interaction.user.id,
      channelIds,
      modRoleIds,
      onProgress,
    });

    if (res.alreadyActive) {
      await interaction.editReply({
        embeds: [
          warnEmbed("A lockdown is already active. Run `/unlockserver` first."),
          statusEmbed(res.state),
        ],
      });
      return;
    }

    const embed = lockResultEmbed({
      tier: sub,
      reason,
      actorId: interaction.user.id,
      durationMs,
      counts: res.counts,
      failed: res.failed,
    });
    await interaction.editReply({ embeds: [embed] });
    await emitLockdownLog(ctx, interaction.guild, embed, { alertChannelId });
  },
};
```

- [ ] **Step 4: Write unlockserver.js**

Create `src/modules/lockdown/commands/unlockserver.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { errorEmbed, warnEmbed } from "../../../lib/embeds.js";
import { unlockResultEmbed } from "../embeds.js";
import { emitLockdownLog } from "../logging.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unlockserver")
    .setDescription("Lift the active server-wide lockdown, restoring exact prior permissions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  permissions: [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild],
  cooldown: 5,
  async execute(interaction, ctx) {
    await interaction.deferReply();
    const res = await ctx.lockdown.unlock({
      guild: interaction.guild,
      actorId: interaction.user.id,
    });

    if (!res.ok && res.reason === "none") {
      await interaction.editReply({ embeds: [warnEmbed("There is no active lockdown.")] });
      return;
    }
    if (!res.ok && res.reason === "corrupt") {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "The lockdown snapshot is missing or corrupt. I won't guess at your permissions — " +
              "restore them manually and check the audit log. The lockdown record was left intact.",
          ),
        ],
      });
      return;
    }
    if (!res.ok && res.reason === "partial") {
      await interaction.editReply({
        embeds: [
          unlockResultEmbed({ actorId: interaction.user.id, counts: {}, failed: res.failed }),
          warnEmbed("Some channels could not be restored — fix my permissions and run `/unlockserver` again."),
        ],
      });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    const alertChannelId = guildConfig.antinuke?.alertChannelId ?? null;
    const embed = unlockResultEmbed({
      actorId: interaction.user.id,
      counts: res.counts,
      failed: res.failed,
    });
    await interaction.editReply({ embeds: [embed] });
    await emitLockdownLog(ctx, interaction.guild, embed, { alertChannelId });
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/modules/lockdown/commands.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/lockdown/commands test/modules/lockdown/commands.test.js
git commit -m "feat(lockdown): /lockserver (tiers + status) and /unlockserver commands"
```

---

## Task 9: DI wiring (ctx.lockdown) + anti-nuke auto-lock hook

**Files:**
- Modify: `src/bot.js` (construct `ctx.lockdown`, import LockdownService)
- Modify: `src/modules/antinuke/orchestrator.js` (auto-lock on punish when flag on)
- Modify: `src/modules/antinuke/raid.js` (auto-lock on raid when flag on)
- Test: `test/modules/antinuke/autolock.test.js`

**Interfaces:**
- Consumes: `LockdownService`, `ctx.lockdown.panic(guild, { reason, actorId })`, `guildConfig.antinuke.autoLockOnTrigger`.
- Produces: `ctx.lockdown` on the DI context; anti-nuke calls `deps.lockdownPanic(guild, reason)` behind the flag.

- [ ] **Step 1: Write the failing test**

Create `test/modules/antinuke/autolock.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { processMemberAdd } from "../../../src/modules/antinuke/raid.js";

describe("anti-nuke auto-lock hook", () => {
  function baseState() {
    return { recordJoin: vi.fn(() => 99) };
  }

  it("fires panic lockdown on raid when autoLockOnTrigger is on", async () => {
    const lockdownPanic = vi.fn(async () => {});
    const deps = { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => {}), lockdownPanic };
    const guildConfig = {
      antinuke: {
        enabled: true,
        antiRaidEnabled: true,
        raidJoinCount: 10,
        raidWindowSec: 10,
        autoLockOnTrigger: true,
        alertChannelId: null,
      },
      whitelist: [],
    };
    const member = { id: "u1", guild: { id: "g1" }, kick: vi.fn() };
    await processMemberAdd({ member, guildConfig, state: baseState(), deps, logger: console });
    expect(lockdownPanic).toHaveBeenCalledWith(member.guild, expect.any(String));
  });

  it("does NOT fire lockdown when the flag is off", async () => {
    const lockdownPanic = vi.fn(async () => {});
    const deps = { kickMember: vi.fn(async () => {}), sendAlert: vi.fn(async () => {}), lockdownPanic };
    const guildConfig = {
      antinuke: {
        enabled: true,
        antiRaidEnabled: true,
        raidJoinCount: 10,
        raidWindowSec: 10,
        autoLockOnTrigger: false,
        alertChannelId: null,
      },
      whitelist: [],
    };
    const member = { id: "u1", guild: { id: "g1" }, kick: vi.fn() };
    await processMemberAdd({ member, guildConfig, state: baseState(), deps, logger: console });
    expect(lockdownPanic).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/modules/antinuke/autolock.test.js`
Expected: FAIL — `processMemberAdd` ignores `deps.lockdownPanic`.

- [ ] **Step 3: Add the hook to raid.js**

In `src/modules/antinuke/raid.js`, inside `processMemberAdd`, after the `deps.sendAlert(...)` call and before `return { action: "raid", count };`, add:

```js
  if (antinuke.autoLockOnTrigger && deps.lockdownPanic) {
    await deps
      .lockdownPanic(member.guild, "Anti-raid: join spike auto-lock")
      .catch((err) => logger?.error?.({ err }, "auto-lock panic failed"));
  }
```

Then extend the default export's `deps` object (the `execute` handler) to pass the real hook:

```js
      const deps = {
        kickMember: (m, reason) => m.kick(reason).catch(() => {}),
        sendAlert,
        lockdownPanic: ctx.lockdown
          ? (guild, reason) => ctx.lockdown.panic(guild, { reason, actorId: "system" })
          : null,
      };
```

- [ ] **Step 4: Add the same hook to orchestrator.js**

In `src/modules/antinuke/orchestrator.js`, inside `processAuditEntry`, immediately before `return { action: "punished", punishment, count };`, add:

```js
  if (antinuke.autoLockOnTrigger && deps.lockdownPanic) {
    await deps
      .lockdownPanic(guild, `Anti-nuke: ${mapped.actionKey} auto-lock`)
      .catch((err) => logger?.error?.({ err }, "auto-lock panic failed"));
  }
```

And in the default export's `deps` object, add:

```js
        lockdownPanic: ctx.lockdown
          ? (g, reason) => ctx.lockdown.panic(g, { reason, actorId: "system" })
          : null,
```

- [ ] **Step 5: Wire ctx.lockdown in bot.js**

In `src/bot.js`, add the import near the other module imports:

```js
import { LockdownService } from "./modules/lockdown/LockdownService.js";
```

In the `context` object literal, add (after `cases: new CaseService(prisma),`):

```js
    lockdown: null, // set below, needs cases
```

Then immediately after the `context` object is created, before `bindEvents(...)`, add:

```js
  context.lockdown = new LockdownService({ prisma, logger, cases: context.cases });
```

(Placing it after construction avoids referencing `context.cases` before it exists.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/modules/antinuke/autolock.test.js test/bot.test.js`
Expected: PASS (new autolock tests + existing bot smoke test still green).

- [ ] **Step 7: Commit**

```bash
git add src/bot.js src/modules/antinuke/orchestrator.js src/modules/antinuke/raid.js test/modules/antinuke/autolock.test.js
git commit -m "feat(lockdown): wire ctx.lockdown and opt-in anti-nuke auto-lock"
```

---

## Task 10: Full suite green + README section

**Files:**
- Modify: `README.md` (new "Server Lockdown" section)

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new lockdown suites. Fix any regressions before continuing.

- [ ] **Step 2: Run lint/format**

Run: `npx eslint src/modules/lockdown && npx prettier --check "src/modules/lockdown/**/*.js"`
Expected: no errors. Run `npx prettier --write "src/modules/lockdown/**/*.js"` if formatting differs, then re-commit.

- [ ] **Step 3: Add the README section**

Insert after the existing `## Anti-Nuke` section in `README.md` (match the surrounding heading style and tone):

```markdown
## Server Lockdown

`/lockserver` is a server-wide lockdown with **exact-state restore**. Unlike the
per-channel `/lockdown`, it snapshots the precise prior state of every permission
overwrite it touches — allow, deny, or neutral (unset) — to Postgres, then restores
exactly that on `/unlockserver`. A neutral overwrite is restored to neutral, never
silently converted to allow. Snapshots survive restarts; a lockdown mid-raid is
never stranded.

**Tiers** — `/lockserver <tier> [duration] [reason]`:

- **panic** — strip `SendMessages` from `@everyone` guild-wide in one API call. Instant, deliberately imperfect (channels with an explicit allow survive) — during a live raid, speed beats completeness.
- **channels** — deny sending across all text channels (or a chosen subset). Correct but N calls; batched with progress.
- **invites** — pause server invites (the guild flag only — no invite links are deleted).
- **joins** — raise verification level to maximum; the prior level is restored on unlock.
- **voice** — deny `Connect`/`Speak` on voice channels.
- **full** — panic → channels → invites → joins → voice, fastest protection first.

**Behaviour:**

- **Staff bypass** — configured mod roles (`/config modrole`) keep an explicit allow so staff can coordinate inside a locked server; it is removed on unlock only if the bot added it.
- **Duration** — optional (`30m`, `2h`). Auto-unlock rides the existing once-per-minute sweep.
- **Idempotent** — running `/lockserver` while a lockdown is active reports status instead of clobbering the snapshot; unlock first to change tiers.
- **Partial failure** — channels the bot can't touch are reported; everything else still locks and stays fully restorable.
- **Corruption-safe** — if the snapshot is missing or corrupt, `/unlockserver` refuses to guess and tells you to restore manually.
- **Anti-nuke** — enable `autoLockOnTrigger` so a detected nuke or raid fires the panic tier automatically.
- **Logging** — every lock/unlock is logged to the mod-actions category and the anti-nuke alert channel: who, tier, reason, duration, channel counts, and failures.

`/lockserver status` shows the active tier, who started it, expiry, and whether invites were paused. Requires **Administrator** or **Manage Server**.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(lockdown): README section for /lockserver server lockdown"
```

- [ ] **Step 5: Final verification**

Run: `npx vitest run && npx eslint src/modules/lockdown`
Expected: all green. The feature is complete.

---

## Self-Review Notes

- **Spec coverage:** panic/channels/invites/joins/voice/full (Task 4), snapshot tri-state + restore (Task 2), Postgres persistence + restart-safe restore + corruption refusal + partial failure + idempotency (Task 5), duration via existing sweep (Task 6), rate-limit batching + progress (Tasks 3, 8), staff bypass (Tasks 4, 5), anti-nuke integration behind opt-in flag (Task 9), logging to mod-actions + alert channel (Task 7), Case creation (Task 5), permissions Administrator/ManageGuild (Task 8), data model + index (Task 1), all six required tests (Tasks 2, 5, 6), README (Task 10). No gaps.
- **Non-goals honoured:** existing `/lockdown`/`/unlock` untouched; no invite deletion; no kick/ban; no new deps.
- **Type consistency:** snapshot rows carry `{ targetType, channelId, targetId, field, priorAllow, priorDeny, addedByUs }` everywhere; `runBatched` returns `{ succeeded, failed:[{item,error}] }` consistently; `start`/`unlock` return `{ ok, ... }` shapes matching the command consumers.
