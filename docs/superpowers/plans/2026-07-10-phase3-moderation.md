# Phase 3 Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the moderation suite — a numbered per-guild case system plus ban/unban/tempban/softban/kick/timeout/untimeout/warn/warnings/case/purge/slowmode/lockdown/unlock/nick slash commands, with role-hierarchy safety, DM-on-action, and scheduled expiry of temp bans.

**Architecture:** A `CaseService` (injected Prisma) allocates case numbers atomically and is the single source of truth for moderation history. Shared helpers (`checkHierarchy`, `dmTarget`, `buildCaseEmbed`) keep commands DRY. Each command validates hierarchy, performs the Discord action, records a `Case`, optionally DMs the target, and replies with a case embed. A once-per-minute scheduler sweep lifts expired temp bans.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`SlashCommandBuilder`, `PermissionFlagsBits`, `EmbedBuilder`), Prisma (`Case` model), node-cron via the foundation `Scheduler`, Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse foundation modules:** `canActOn` (`src/lib/hierarchy.js`), `parseDuration`/`formatDuration` (`src/lib/duration.js`), `successEmbed`/`errorEmbed`/`infoEmbed` (`src/lib/embeds.js`), `COLORS` (`src/lib/constants.js`), the `Scheduler` (`src/core/Scheduler.js`), and `ConfigService.getGuild` (for the `dmOnAction` flag). Do NOT re-implement them.
- **All new code under `src/modules/moderation/`**; commands auto-discovered from `commands/*.js`.
- **Hierarchy safety:** every command that targets a guild member must pass `checkHierarchy` before acting; a target above the actor or above the bot, or the guild owner, is rejected.
- **Never throw out of a command:** wrap Discord calls; on failure reply with an ephemeral error embed. (The interaction router already wraps execution in `runSafely`, but user-facing failures should be explicit.)
- **`Case.type`** is one of: `ban|tempban|softban|kick|timeout|warn|unban|untimeout`.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (Conventional Commits, `feat(mod): ...`).

---

### Task 1: CaseService (`src/modules/moderation/CaseService.js`)

**Files:**
- Create: `src/modules/moderation/CaseService.js`
- Test: `test/modules/moderation/CaseService.test.js`

**Interfaces:**
- Consumes: injected Prisma-like client with `$transaction`, `case.findFirst`, `case.create`, `case.findUnique`, `case.findMany`, `case.update`, `case.delete`.
- Produces: class `CaseService`:
  - `constructor(prisma)`.
  - `async createCase({ guildId, type, targetId, moderatorId, reason?, expiresAt? }): case` — allocates the next per-guild `caseNumber` atomically inside `$transaction`.
  - `async getCase(guildId, caseNumber): case | null`.
  - `async listCases(guildId, targetId): case[]` (ascending by caseNumber).
  - `async updateReason(guildId, caseNumber, reason): case`.
  - `async deleteCase(guildId, caseNumber): case`.
  - `async dueExpired(now = new Date()): case[]` — active `tempban` cases with `expiresAt <= now`.
  - `async deactivate(id): case`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { CaseService } from "../../../src/modules/moderation/CaseService.js";

function mockPrisma({ lastCaseNumber = 0 } = {}) {
  const tx = {
    case: {
      findFirst: vi.fn(async () => (lastCaseNumber ? { caseNumber: lastCaseNumber } : null)),
      create: vi.fn(async ({ data }) => ({ id: "c1", ...data })),
    },
  };
  return {
    $transaction: vi.fn(async (fn) => fn(tx)),
    _tx: tx,
    case: {
      findUnique: vi.fn(async ({ where }) => ({ id: "c1", ...where.guildId_caseNumber })),
      findMany: vi.fn(async () => [{ caseNumber: 1 }, { caseNumber: 2 }]),
      update: vi.fn(async ({ where, data }) => ({ ...where.guildId_caseNumber, ...data })),
      delete: vi.fn(async ({ where }) => ({ ...where.guildId_caseNumber })),
    },
  };
}

describe("CaseService", () => {
  it("allocates the first case number as 1", async () => {
    const prisma = mockPrisma({ lastCaseNumber: 0 });
    const svc = new CaseService(prisma);
    const c = await svc.createCase({ guildId: "g1", type: "ban", targetId: "u1", moderatorId: "m1" });
    expect(c.caseNumber).toBe(1);
    expect(c.reason).toBe("No reason provided");
  });

  it("increments the case number atomically", async () => {
    const prisma = mockPrisma({ lastCaseNumber: 7 });
    const svc = new CaseService(prisma);
    const c = await svc.createCase({ guildId: "g1", type: "kick", targetId: "u1", moderatorId: "m1", reason: "spam" });
    expect(c.caseNumber).toBe(8);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("lists cases for a target and updates a reason", async () => {
    const prisma = mockPrisma();
    const svc = new CaseService(prisma);
    expect(await svc.listCases("g1", "u1")).toHaveLength(2);
    const updated = await svc.updateReason("g1", 2, "edited");
    expect(updated.reason).toBe("edited");
  });

  it("finds due expired temp bans", async () => {
    const prisma = mockPrisma();
    prisma.case.findMany = vi.fn(async ({ where }) => {
      expect(where.type).toBe("tempban");
      expect(where.active).toBe(true);
      return [{ id: "c9", targetId: "u9", guildId: "g1" }];
    });
    const svc = new CaseService(prisma);
    const due = await svc.dueExpired(new Date());
    expect(due[0].id).toBe("c9");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/CaseService.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export class CaseService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async createCase({ guildId, type, targetId, moderatorId, reason = "No reason provided", expiresAt = null }) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.case.findFirst({
        where: { guildId },
        orderBy: { caseNumber: "desc" },
        select: { caseNumber: true },
      });
      const caseNumber = (last?.caseNumber ?? 0) + 1;
      return tx.case.create({
        data: { guildId, caseNumber, type, targetId, moderatorId, reason, expiresAt },
      });
    });
  }

  async getCase(guildId, caseNumber) {
    return this.prisma.case.findUnique({ where: { guildId_caseNumber: { guildId, caseNumber } } });
  }

  async listCases(guildId, targetId) {
    return this.prisma.case.findMany({
      where: { guildId, targetId },
      orderBy: { caseNumber: "asc" },
    });
  }

  async updateReason(guildId, caseNumber, reason) {
    return this.prisma.case.update({
      where: { guildId_caseNumber: { guildId, caseNumber } },
      data: { reason },
    });
  }

  async deleteCase(guildId, caseNumber) {
    return this.prisma.case.delete({ where: { guildId_caseNumber: { guildId, caseNumber } } });
  }

  async dueExpired(now = new Date()) {
    return this.prisma.case.findMany({
      where: { active: true, type: "tempban", expiresAt: { not: null, lte: now } },
    });
  }

  async deactivate(id) {
    return this.prisma.case.update({ where: { id }, data: { active: false } });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/CaseService.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/moderation/CaseService.js test/modules/moderation/CaseService.test.js
git commit -m "feat(mod): add numbered case service"
```

---

### Task 2: Shared helpers (`src/modules/moderation/helpers.js`)

**Files:**
- Create: `src/modules/moderation/helpers.js`
- Test: `test/modules/moderation/helpers.test.js`

**Interfaces:**
- Consumes: `canActOn` (`src/lib/hierarchy.js`), `EmbedBuilder`, `COLORS`.
- Produces:
  - `checkHierarchy({ actorMember, targetMember, botMember }): { ok: true } | { ok: false, message: string }` — maps `canActOn` reasons to user-facing messages.
  - `async dmTarget(user, embed, logger): boolean` — best-effort DM; never throws.
  - `buildCaseEmbed(caseRow): EmbedBuilder` — case summary (number, type, user, moderator, reason).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../../../src/modules/moderation/helpers.js";

const member = (id, pos, ownerId = "owner") => ({
  id,
  roles: { highest: { position: pos } },
  guild: { ownerId },
});

describe("checkHierarchy", () => {
  const bot = member("bot", 10);
  it("allows a valid action", () => {
    expect(checkHierarchy({ actorMember: member("a", 5), targetMember: member("t", 3), botMember: bot }).ok).toBe(true);
  });
  it("blocks with a message when the target is the owner", () => {
    const res = checkHierarchy({ actorMember: member("a", 5), targetMember: member("owner", 3), botMember: bot });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/owner/i);
  });
  it("blocks when the actor is not higher", () => {
    const res = checkHierarchy({ actorMember: member("a", 3), targetMember: member("t", 4), botMember: bot });
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe("string");
  });
});

describe("dmTarget", () => {
  it("returns true on success", async () => {
    const user = { send: vi.fn(async () => {}) };
    expect(await dmTarget(user, {}, { debug: vi.fn() })).toBe(true);
  });
  it("returns false when DMs are closed", async () => {
    const user = { send: vi.fn(async () => { throw new Error("cannot dm"); }) };
    expect(await dmTarget(user, {}, { debug: vi.fn() })).toBe(false);
  });
});

describe("buildCaseEmbed", () => {
  it("renders case fields", () => {
    const e = buildCaseEmbed({ caseNumber: 5, type: "ban", targetId: "u1", moderatorId: "m1", reason: "spam", createdAt: new Date() });
    const s = JSON.stringify(e.data);
    expect(s).toContain("5");
    expect(s).toContain("ban");
    expect(s).toContain("spam");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/helpers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";
import { canActOn } from "../../lib/hierarchy.js";

const HIERARCHY_MESSAGES = {
  target_is_owner: "You can't moderate the server owner.",
  actor_not_higher: "You can't moderate someone whose highest role is above or equal to yours.",
  bot_not_higher: "My highest role isn't above that member — move my role up to moderate them.",
};

export function checkHierarchy({ actorMember, targetMember, botMember }) {
  const res = canActOn({ actor: actorMember, target: targetMember, botMember });
  if (res.ok) return { ok: true };
  return { ok: false, message: HIERARCHY_MESSAGES[res.reason] ?? "You can't moderate that member." };
}

export async function dmTarget(user, embed, logger) {
  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch (err) {
    logger?.debug?.({ err }, "could not DM target");
    return false;
  }
}

const TYPE_COLORS = {
  ban: COLORS.error,
  tempban: COLORS.error,
  softban: COLORS.error,
  kick: COLORS.warn,
  timeout: COLORS.warn,
  warn: COLORS.warn,
  unban: COLORS.success,
  untimeout: COLORS.success,
};

export function buildCaseEmbed(caseRow) {
  return new EmbedBuilder()
    .setColor(TYPE_COLORS[caseRow.type] ?? COLORS.info)
    .setTitle(`Case #${caseRow.caseNumber} — ${caseRow.type}`)
    .addFields(
      { name: "User", value: `<@${caseRow.targetId}> (\`${caseRow.targetId}\`)`, inline: true },
      { name: "Moderator", value: `<@${caseRow.moderatorId}>`, inline: true },
      { name: "Reason", value: caseRow.reason ?? "No reason provided" },
    )
    .setTimestamp(caseRow.createdAt ? new Date(caseRow.createdAt) : new Date());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/helpers.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/moderation/helpers.js test/modules/moderation/helpers.test.js
git commit -m "feat(mod): add hierarchy, DM, and case-embed helpers"
```

---

### Task 3: Ban family — `/ban`, `/unban`, `/softban`, `/kick`

**Files:**
- Create: `src/modules/moderation/commands/ban.js`
- Create: `src/modules/moderation/commands/unban.js`
- Create: `src/modules/moderation/commands/softban.js`
- Create: `src/modules/moderation/commands/kick.js`
- Test: `test/modules/moderation/banFamily.test.js`

**Interfaces:**
- Consumes: `checkHierarchy`, `dmTarget`, `buildCaseEmbed` (T2); `ctx.cases` (T1), `ctx.config.getGuild`, `errorEmbed`/`infoEmbed`.
- Produces: four command modules `{ data, permissions, execute(interaction, ctx) }`. Each `execute` follows: resolve user → (if member) hierarchy check → DM if `dmOnAction` → perform action → create case → reply with case embed; on Discord failure reply with an ephemeral error embed.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import ban from "../../../src/modules/moderation/commands/ban.js";
import kick from "../../../src/modules/moderation/commands/kick.js";
import unban from "../../../src/modules/moderation/commands/unban.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

function guild({ higherActor = true } = {}) {
  return {
    name: "Test",
    ownerId: "owner",
    members: {
      me: { id: "bot", roles: { highest: { position: 100 } } },
      fetch: vi.fn(async (id) => ({
        id,
        roles: { highest: { position: 3 } },
        guild: { ownerId: "owner" },
        kick: vi.fn(async () => {}),
      })),
    },
    bans: { create: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
  };
}

function interaction(opts, g = guild()) {
  return {
    guildId: "g1",
    guild: g,
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: {
      getUser: (k) => opts[k] ?? null,
      getString: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/ban", () => {
  it("bans, records a case, and replies with a case embed", async () => {
    const c = ctx();
    const g = guild();
    const i = interaction({ user: { id: "target1", send: vi.fn() }, reason: "spam" }, g);
    await ban.execute(i, c);
    expect(g.bans.create).toHaveBeenCalledWith("target1", expect.objectContaining({ reason: "spam" }));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "ban", targetId: "target1" }));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("refuses when the target outranks the actor", async () => {
    const c = ctx();
    const g = guild();
    g.members.fetch = vi.fn(async (id) => ({ id, roles: { highest: { position: 90 } }, guild: { ownerId: "owner" } }));
    const i = interaction({ user: { id: "target1" } }, g);
    await ban.execute(i, c);
    expect(g.bans.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("/kick", () => {
  it("kicks a member and records a case", async () => {
    const c = ctx();
    const member = { id: "t1", roles: { highest: { position: 3 } }, guild: { ownerId: "owner" }, kick: vi.fn(async () => {}) };
    const g = guild();
    g.members.fetch = vi.fn(async () => member);
    const i = interaction({ user: { id: "t1" }, reason: "rude" }, g);
    await kick.execute(i, c);
    expect(member.kick).toHaveBeenCalled();
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "kick" }));
  });
});

describe("/unban", () => {
  it("removes a ban and records an unban case", async () => {
    const c = ctx();
    const g = guild();
    const i = interaction({ user_id: "banned1", reason: "appeal" }, g);
    // unban takes a string user id option named "user_id"
    await unban.execute(i, c);
    expect(g.bans.remove).toHaveBeenCalledWith("banned1", expect.any(String));
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "unban", targetId: "banned1" }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/banFamily.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/moderation/commands/ban.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban"))
    .addIntegerOption((o) =>
      o.setName("delete_days").setDescription("Delete this many days of messages (0-7)").setMinValue(0).setMaxValue(7),
    ),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (targetMember) {
      const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction && targetMember) {
      await dmTarget(user, infoEmbed(`You were banned from ${interaction.guild.name}`, `**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await interaction.guild.bans.create(user.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
    } catch (err) {
      ctx.logger.error({ err }, "ban failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't ban that user — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "ban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/kick.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick")),
  permissions: [PermissionFlagsBits.KickMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(user, infoEmbed(`You were kicked from ${interaction.guild.name}`, `**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await targetMember.kick(reason);
    } catch (err) {
      ctx.logger.error({ err }, "kick failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't kick that member — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "kick",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 5: Write `src/modules/moderation/commands/unban.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildCaseEmbed } from "../helpers.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Lift a ban from a user ID.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("user_id").setDescription("The banned user's ID").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the unban")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const userId = interaction.options.getString("user_id");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      await interaction.guild.bans.remove(userId, reason);
    } catch (err) {
      ctx.logger.error({ err }, "unban failed");
      await interaction.reply({ embeds: [errorEmbed("That user isn't banned, or I lack permission.")], ephemeral: true });
      return;
    }
    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "unban",
      targetId: userId,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 6: Write `src/modules/moderation/commands/softban.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("softban")
    .setDescription("Ban then immediately unban to clear a user's recent messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to softban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const botMember = interaction.guild.members.me;
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (targetMember) {
      const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction && targetMember) {
      await dmTarget(user, infoEmbed(`You were softbanned from ${interaction.guild.name}`, `**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await interaction.guild.bans.create(user.id, { reason: `Softban: ${reason}`, deleteMessageSeconds: 86400 });
      await interaction.guild.bans.remove(user.id, "Softban (auto-unban)");
    } catch (err) {
      ctx.logger.error({ err }, "softban failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't softban that user — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "softban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/banFamily.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add src/modules/moderation/commands/ban.js src/modules/moderation/commands/kick.js src/modules/moderation/commands/unban.js src/modules/moderation/commands/softban.js test/modules/moderation/banFamily.test.js
git commit -m "feat(mod): add ban, kick, unban, and softban commands"
```

---

### Task 4: `/timeout` and `/untimeout`

**Files:**
- Create: `src/modules/moderation/commands/timeout.js`
- Create: `src/modules/moderation/commands/untimeout.js`
- Test: `test/modules/moderation/timeout.test.js`

**Interfaces:**
- Consumes: `parseDuration`/`formatDuration` (`src/lib/duration.js`), `checkHierarchy`, `dmTarget`, `buildCaseEmbed`, `errorEmbed`/`infoEmbed`, `ctx.cases`, `ctx.config`.
- Produces: two command modules. `/timeout` parses a duration string (max 28 days), calls `member.timeout(ms, reason)`, records a `timeout` case. `/untimeout` calls `member.timeout(null)` and records an `untimeout` case.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import timeout from "../../../src/modules/moderation/commands/timeout.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

function makeMember() {
  return { id: "t1", roles: { highest: { position: 3 } }, guild: { ownerId: "owner" }, timeout: vi.fn(async () => {}) };
}

function interaction(opts, member) {
  return {
    guildId: "g1",
    guild: { name: "T", ownerId: "owner", members: { me: { id: "bot", roles: { highest: { position: 100 } } }, fetch: vi.fn(async () => member) } },
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
  };
}

describe("/timeout", () => {
  it("times out a member for the parsed duration", async () => {
    const c = ctx();
    const member = makeMember();
    await timeout.execute(interaction({ duration: "10m", reason: "cool off" }, member), c);
    expect(member.timeout).toHaveBeenCalledWith(600_000, "cool off");
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
  });

  it("rejects an invalid duration", async () => {
    const c = ctx();
    const i = interaction({ duration: "abc" }, makeMember());
    await timeout.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(c.cases.createCase).not.toHaveBeenCalled();
  });

  it("rejects durations over 28 days", async () => {
    const c = ctx();
    const member = makeMember();
    const i = interaction({ duration: "30d" }, member);
    await timeout.execute(i, c);
    expect(member.timeout).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/timeout.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/modules/moderation/commands/timeout.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration, formatDuration } from "../../../lib/duration.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

const MAX_TIMEOUT_MS = 28 * 86400 * 1000;

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Temporarily mute a member using Discord's native timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to time out").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 2h, 7d (max 28d)").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const ms = parseDuration(durationStr);
    if (!ms) {
      await interaction.reply({ embeds: [errorEmbed("Invalid duration. Try `10m`, `2h`, or `7d`.")], ephemeral: true });
      return;
    }
    if (ms > MAX_TIMEOUT_MS) {
      await interaction.reply({ embeds: [errorEmbed("Timeouts can be at most 28 days.")], ephemeral: true });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(user, infoEmbed(`You were timed out in ${interaction.guild.name}`, `**Duration:** ${formatDuration(ms)}\n**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await targetMember.timeout(ms, reason);
    } catch (err) {
      ctx.logger.error({ err }, "timeout failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't time out that member — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "timeout",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      expiresAt: new Date(Date.now() + ms),
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/untimeout.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy, buildCaseEmbed } from "../helpers.js";
import { errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout early.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }
    try {
      await targetMember.timeout(null, reason);
    } catch (err) {
      ctx.logger.error({ err }, "untimeout failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't remove that timeout.")], ephemeral: true });
      return;
    }
    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "untimeout",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/timeout.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/moderation/commands/timeout.js src/modules/moderation/commands/untimeout.js test/modules/moderation/timeout.test.js
git commit -m "feat(mod): add timeout and untimeout commands"
```

---

### Task 5: `/warn`, `/warnings`, `/case`

**Files:**
- Create: `src/modules/moderation/commands/warn.js`
- Create: `src/modules/moderation/commands/warnings.js`
- Create: `src/modules/moderation/commands/case.js`
- Test: `test/modules/moderation/infractions.test.js`

**Interfaces:**
- Consumes: `ctx.cases` (createCase, listCases, getCase, updateReason, deleteCase), `buildCaseEmbed`, `dmTarget`, `errorEmbed`/`infoEmbed`/`successEmbed`, `EmbedBuilder`.
- Produces:
  - `/warn user reason` → records a `warn` case, DMs the user, replies with the case embed.
  - `/warnings user` → lists a user's cases in an embed (empty-state handled).
  - `/case` with subcommands `view number`, `reason number text`, `delete number`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import warn from "../../../src/modules/moderation/commands/warn.js";
import warnings from "../../../src/modules/moderation/commands/warnings.js";
import caseCmd from "../../../src/modules/moderation/commands/case.js";

function ctx(overrides = {}) {
  return {
    cases: {
      createCase: vi.fn(async (d) => ({ caseNumber: 3, createdAt: new Date(), ...d })),
      listCases: vi.fn(async () => [
        { caseNumber: 1, type: "warn", reason: "a", moderatorId: "m", targetId: "u1", createdAt: new Date() },
      ]),
      getCase: vi.fn(async () => ({ caseNumber: 1, type: "warn", reason: "a", moderatorId: "m", targetId: "u1", createdAt: new Date() })),
      updateReason: vi.fn(async () => ({ caseNumber: 1, type: "warn", reason: "new", moderatorId: "m", targetId: "u1" })),
      deleteCase: vi.fn(async () => ({ caseNumber: 1 })),
      ...overrides,
    },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: true })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}

const reply = () => vi.fn(async () => {});

describe("/warn", () => {
  it("records a warn case and replies", async () => {
    const c = ctx();
    const i = {
      guildId: "g1",
      guild: { name: "T" },
      user: { id: "mod1" },
      options: { getUser: () => ({ id: "u1", send: vi.fn(async () => {}) }), getString: () => "be nice" },
      reply: reply(),
    };
    await warn.execute(i, c);
    expect(c.cases.createCase).toHaveBeenCalledWith(expect.objectContaining({ type: "warn", targetId: "u1" }));
    expect(i.reply).toHaveBeenCalled();
  });
});

describe("/warnings", () => {
  it("lists a user's cases", async () => {
    const c = ctx();
    const i = { guildId: "g1", options: { getUser: () => ({ id: "u1" }) }, reply: reply() };
    await warnings.execute(i, c);
    expect(c.cases.listCases).toHaveBeenCalledWith("g1", "u1");
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});

describe("/case", () => {
  it("view returns the case embed", async () => {
    const c = ctx();
    const i = { guildId: "g1", options: { getSubcommand: () => "view", getInteger: () => 1, getString: () => null }, reply: reply() };
    await caseCmd.execute(i, c);
    expect(c.cases.getCase).toHaveBeenCalledWith("g1", 1);
  });

  it("reason edits a case", async () => {
    const c = ctx();
    const i = { guildId: "g1", options: { getSubcommand: () => "reason", getInteger: () => 1, getString: () => "new" }, reply: reply() };
    await caseCmd.execute(i, c);
    expect(c.cases.updateReason).toHaveBeenCalledWith("g1", 1, "new");
  });

  it("delete removes a case", async () => {
    const c = ctx();
    const i = { guildId: "g1", options: { getSubcommand: () => "delete", getInteger: () => 1, getString: () => null }, reply: reply() };
    await caseCmd.execute(i, c);
    expect(c.cases.deleteCase).toHaveBeenCalledWith("g1", 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/infractions.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/moderation/commands/warn.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { dmTarget, buildCaseEmbed } from "../helpers.js";
import { infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction) {
      await dmTarget(user, infoEmbed(`You were warned in ${interaction.guild.name}`, `**Reason:** ${reason}`), ctx.logger);
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "warn",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/warnings.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { COLORS } from "../../../lib/constants.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("List a member's moderation history.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to look up").setRequired(true)),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const cases = await ctx.cases.listCases(interaction.guildId, user.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`Moderation history — ${user.id}`);

    if (cases.length === 0) {
      embed.setDescription("No cases on record. ✨");
    } else {
      embed.setDescription(
        cases
          .map((c) => `**#${c.caseNumber}** \`${c.type}\` — ${c.reason} (by <@${c.moderatorId}>)`)
          .slice(0, 25)
          .join("\n"),
      );
    }
    await interaction.reply({ embeds: [embed] });
  },
};
```

- [ ] **Step 5: Write `src/modules/moderation/commands/case.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { buildCaseEmbed } from "../helpers.js";
import { errorEmbed, successEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View or edit a moderation case.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s.setName("view").setDescription("View a case").addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("reason")
        .setDescription("Edit a case reason")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true))
        .addStringOption((o) => o.setName("text").setDescription("New reason").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("delete").setDescription("Delete a case").addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true)),
    ),
  permissions: [PermissionFlagsBits.ModerateMembers],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger("number");
    const guildId = interaction.guildId;

    if (sub === "view") {
      const record = await ctx.cases.getCase(guildId, number);
      if (!record) {
        await interaction.reply({ embeds: [errorEmbed(`Case #${number} not found.`)], ephemeral: true });
        return;
      }
      await interaction.reply({ embeds: [buildCaseEmbed(record)] });
      return;
    }
    if (sub === "reason") {
      const text = interaction.options.getString("text");
      try {
        const updated = await ctx.cases.updateReason(guildId, number, text);
        await interaction.reply({ embeds: [buildCaseEmbed(updated)] });
      } catch {
        await interaction.reply({ embeds: [errorEmbed(`Case #${number} not found.`)], ephemeral: true });
      }
      return;
    }
    if (sub === "delete") {
      try {
        await ctx.cases.deleteCase(guildId, number);
        await interaction.reply({ embeds: [successEmbed(`Case #${number} deleted.`)] });
      } catch {
        await interaction.reply({ embeds: [errorEmbed(`Case #${number} not found.`)], ephemeral: true });
      }
    }
  },
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/infractions.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/moderation/commands/warn.js src/modules/moderation/commands/warnings.js src/modules/moderation/commands/case.js test/modules/moderation/infractions.test.js
git commit -m "feat(mod): add warn, warnings, and case commands"
```

---

### Task 6: `/tempban` + expiry sweep (`src/modules/moderation/commands/tempban.js`, `src/modules/moderation/expiry.js`)

**Files:**
- Create: `src/modules/moderation/commands/tempban.js`
- Create: `src/modules/moderation/expiry.js`
- Test: `test/modules/moderation/tempban.test.js`
- Test: `test/modules/moderation/expiry.test.js`

**Interfaces:**
- Consumes: `parseDuration`/`formatDuration`, `checkHierarchy`, `dmTarget`, `buildCaseEmbed`, `ctx.cases` (createCase, dueExpired, deactivate), `ctx.config`.
- Produces:
  - `/tempban user duration reason` — bans, records a `tempban` case with `expiresAt`, replies.
  - `async sweepExpired({ client, caseService, logger, now? }): number` — finds due temp bans, lifts each ban via `client.guilds.cache.get(guildId)?.bans.remove(targetId)`, deactivates the case; returns the count processed.
  - `registerExpiryJob(context)` — schedules `sweepExpired` every minute via `context.scheduler`.

- [ ] **Step 1: Write the failing tests**

`test/modules/moderation/expiry.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { sweepExpired } from "../../../src/modules/moderation/expiry.js";

describe("sweepExpired", () => {
  it("lifts due temp bans and deactivates their cases", async () => {
    const remove = vi.fn(async () => {});
    const client = { guilds: { cache: new Map([["g1", { bans: { remove } }]]) } };
    const caseService = {
      dueExpired: vi.fn(async () => [{ id: "c1", guildId: "g1", targetId: "u1" }]),
      deactivate: vi.fn(async () => {}),
    };
    const count = await sweepExpired({ client, caseService, logger: { error: vi.fn(), info: vi.fn() } });
    expect(count).toBe(1);
    expect(remove).toHaveBeenCalledWith("u1", expect.any(String));
    expect(caseService.deactivate).toHaveBeenCalledWith("c1");
  });

  it("still deactivates when the guild is not on this shard", async () => {
    const client = { guilds: { cache: new Map() } };
    const caseService = {
      dueExpired: vi.fn(async () => [{ id: "c2", guildId: "gX", targetId: "u2" }]),
      deactivate: vi.fn(async () => {}),
    };
    const count = await sweepExpired({ client, caseService, logger: { error: vi.fn(), info: vi.fn() } });
    expect(count).toBe(1);
    expect(caseService.deactivate).toHaveBeenCalledWith("c2");
  });
});
```

`test/modules/moderation/tempban.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import tempban from "../../../src/modules/moderation/commands/tempban.js";

function ctx() {
  return {
    cases: { createCase: vi.fn(async (d) => ({ caseNumber: 1, ...d })) },
    config: { getGuild: vi.fn(async () => ({ dmOnAction: false })) },
    logger: { error: vi.fn(), debug: vi.fn() },
  };
}
function interaction(opts) {
  const g = {
    name: "T",
    ownerId: "owner",
    members: { me: { id: "bot", roles: { highest: { position: 100 } } }, fetch: vi.fn(async () => null) },
    bans: { create: vi.fn(async () => {}) },
  };
  return {
    guildId: "g1",
    guild: g,
    user: { id: "mod1" },
    member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
    options: { getUser: () => ({ id: "t1", send: vi.fn() }), getString: (k) => opts[k] ?? null },
    reply: vi.fn(async () => {}),
    _guild: g,
  };
}

describe("/tempban", () => {
  it("bans and records a tempban case with an expiry", async () => {
    const c = ctx();
    const i = interaction({ duration: "1h", reason: "raid" });
    await tempban.execute(i, c);
    expect(i._guild.bans.create).toHaveBeenCalled();
    const arg = c.cases.createCase.mock.calls[0][0];
    expect(arg.type).toBe("tempban");
    expect(arg.expiresAt instanceof Date).toBe(true);
  });

  it("rejects an invalid duration", async () => {
    const c = ctx();
    const i = interaction({ duration: "nope" });
    await tempban.execute(i, c);
    expect(i._guild.bans.create).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/modules/moderation/tempban.test.js test/modules/moderation/expiry.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/moderation/expiry.js`**

```js
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
  context.scheduler.every("* * * * *", "mod-expiry", () =>
    sweepExpired({ client: context.client, caseService: context.cases, logger: context.logger }),
  );
}
```

- [ ] **Step 4: Write `src/modules/moderation/commands/tempban.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration, formatDuration } from "../../../lib/duration.js";
import { checkHierarchy, dmTarget, buildCaseEmbed } from "../helpers.js";
import { errorEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Ban a user for a limited time.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 1h, 7d, 2w").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.BanMembers],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    const ms = parseDuration(durationStr);
    if (!ms) {
      await interaction.reply({ embeds: [errorEmbed("Invalid duration. Try `1h`, `7d`, or `2w`.")], ephemeral: true });
      return;
    }

    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (targetMember) {
      const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
        return;
      }
    }

    const guildConfig = await ctx.config.getGuild(interaction.guildId);
    if (guildConfig.dmOnAction && targetMember) {
      await dmTarget(user, infoEmbed(`You were temporarily banned from ${interaction.guild.name}`, `**Duration:** ${formatDuration(ms)}\n**Reason:** ${reason}`), ctx.logger);
    }

    try {
      await interaction.guild.bans.create(user.id, { reason: `Tempban (${formatDuration(ms)}): ${reason}` });
    } catch (err) {
      ctx.logger.error({ err }, "tempban failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't ban that user — check my permissions and role position.")], ephemeral: true });
      return;
    }

    const record = await ctx.cases.createCase({
      guildId: interaction.guildId,
      type: "tempban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      expiresAt: new Date(Date.now() + ms),
    });
    await interaction.reply({ embeds: [buildCaseEmbed(record)] });
  },
};
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run test/modules/moderation/tempban.test.js test/modules/moderation/expiry.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/moderation/commands/tempban.js src/modules/moderation/expiry.js test/modules/moderation/tempban.test.js test/modules/moderation/expiry.test.js
git commit -m "feat(mod): add tempban with scheduled expiry sweep"
```

---

### Task 7: Channel ops — `/purge`, `/slowmode`

**Files:**
- Create: `src/modules/moderation/commands/purge.js`
- Create: `src/modules/moderation/commands/slowmode.js`
- Test: `test/modules/moderation/channelOps.test.js`

**Interfaces:**
- Consumes: `SlashCommandBuilder`, `PermissionFlagsBits`; `successEmbed`/`errorEmbed`; `parseDuration` (for slowmode string like `10s`, `5m`).
- Produces:
  - `/purge amount [user]` → `interaction.channel.bulkDelete(amount, true)`; optional filter by author (fetch then filter); replies ephemerally with the count.
  - `/slowmode duration` → `interaction.channel.setRateLimitPerUser(seconds)`; `0`/`off` clears it.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import purge from "../../../src/modules/moderation/commands/purge.js";
import slowmode from "../../../src/modules/moderation/commands/slowmode.js";

describe("/purge", () => {
  it("bulk-deletes the requested amount", async () => {
    const bulkDelete = vi.fn(async () => ({ size: 10 }));
    const i = {
      channel: { bulkDelete },
      options: { getInteger: () => 10, getUser: () => null },
      reply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() } });
    expect(bulkDelete).toHaveBeenCalledWith(10, true);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("rejects amounts outside 1-100", async () => {
    const i = {
      channel: { bulkDelete: vi.fn() },
      options: { getInteger: () => 500, getUser: () => null },
      reply: vi.fn(async () => {}),
    };
    await purge.execute(i, { logger: { error: vi.fn() } });
    expect(i.channel.bulkDelete).not.toHaveBeenCalled();
  });
});

describe("/slowmode", () => {
  it("sets the channel rate limit from a duration", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = {
      channel: { setRateLimitPerUser },
      options: { getString: () => "10s" },
      reply: vi.fn(async () => {}),
    };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(10);
  });

  it("clears slowmode on 'off'", async () => {
    const setRateLimitPerUser = vi.fn(async () => {});
    const i = { channel: { setRateLimitPerUser }, options: { getString: () => "off" }, reply: vi.fn(async () => {}) };
    await slowmode.execute(i, { logger: { error: vi.fn() } });
    expect(setRateLimitPerUser).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/channelOps.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/moderation/commands/purge.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName("amount").setDescription("How many (1-100)").setRequired(true))
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this user")),
  permissions: [PermissionFlagsBits.ManageMessages],
  async execute(interaction, ctx) {
    const amount = interaction.options.getInteger("amount");
    const user = interaction.options.getUser("user");
    if (amount < 1 || amount > 100) {
      await interaction.reply({ embeds: [errorEmbed("Amount must be between 1 and 100.")], ephemeral: true });
      return;
    }
    try {
      let deleted;
      if (user) {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const mine = [...messages.values()].filter((m) => m.author?.id === user.id).slice(0, amount);
        const result = await interaction.channel.bulkDelete(mine, true);
        deleted = result.size ?? mine.length;
      } else {
        const result = await interaction.channel.bulkDelete(amount, true);
        deleted = result.size ?? amount;
      }
      await interaction.reply({ embeds: [successEmbed(`Deleted **${deleted}** message(s).`)], ephemeral: true });
    } catch (err) {
      ctx.logger.error({ err }, "purge failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't delete messages (they may be older than 14 days).")], ephemeral: true });
    }
  },
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/slowmode.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { parseDuration } from "../../../lib/duration.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

const MAX_SLOWMODE_SEC = 21600; // Discord max: 6 hours

export default {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set this channel's slowmode.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 10s, 5m, or 'off'").setRequired(true)),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    const input = interaction.options.getString("duration");
    let seconds;
    if (input.toLowerCase() === "off" || input === "0") {
      seconds = 0;
    } else {
      const ms = parseDuration(input);
      if (!ms) {
        await interaction.reply({ embeds: [errorEmbed("Invalid duration. Try `10s`, `5m`, or `off`.")], ephemeral: true });
        return;
      }
      seconds = Math.min(Math.round(ms / 1000), MAX_SLOWMODE_SEC);
    }
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply({ embeds: [successEmbed(seconds === 0 ? "Slowmode disabled." : `Slowmode set to **${seconds}s**.`)] });
    } catch (err) {
      ctx.logger.error({ err }, "slowmode failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't set slowmode here.")], ephemeral: true });
    }
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/channelOps.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/moderation/commands/purge.js src/modules/moderation/commands/slowmode.js test/modules/moderation/channelOps.test.js
git commit -m "feat(mod): add purge and slowmode commands"
```

---

### Task 8: `/lockdown`, `/unlock`, `/nick`

**Files:**
- Create: `src/modules/moderation/commands/lockdown.js`
- Create: `src/modules/moderation/commands/unlock.js`
- Create: `src/modules/moderation/commands/nick.js`
- Test: `test/modules/moderation/lockNick.test.js`

**Interfaces:**
- Consumes: `SlashCommandBuilder`, `PermissionFlagsBits`; `successEmbed`/`errorEmbed`; `checkHierarchy` (for nick).
- Produces:
  - `/lockdown [reason]` → denies `SendMessages` for `@everyone` on the current channel.
  - `/unlock` → clears that override (`SendMessages: null`).
  - `/nick user [nickname]` → sets/clears a member's nickname (hierarchy-checked).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import lockdown from "../../../src/modules/moderation/commands/lockdown.js";
import unlock from "../../../src/modules/moderation/commands/unlock.js";
import nick from "../../../src/modules/moderation/commands/nick.js";

function channel() {
  return { permissionOverwrites: { edit: vi.fn(async () => {}) } };
}
function guildWith(member) {
  return {
    roles: { everyone: { id: "everyone" } },
    ownerId: "owner",
    members: { me: { id: "bot", roles: { highest: { position: 100 } } }, fetch: vi.fn(async () => member) },
  };
}

describe("/lockdown", () => {
  it("denies SendMessages for @everyone", async () => {
    const ch = channel();
    const g = guildWith(null);
    const i = { channel: ch, guild: g, options: { getString: () => null }, reply: vi.fn(async () => {}) };
    await lockdown.execute(i, { logger: { error: vi.fn() } });
    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith({ id: "everyone" }, { SendMessages: false });
  });
});

describe("/unlock", () => {
  it("clears the SendMessages override", async () => {
    const ch = channel();
    const g = guildWith(null);
    const i = { channel: ch, guild: g, reply: vi.fn(async () => {}) };
    await unlock.execute(i, { logger: { error: vi.fn() } });
    expect(ch.permissionOverwrites.edit).toHaveBeenCalledWith({ id: "everyone" }, { SendMessages: null });
  });
});

describe("/nick", () => {
  it("sets a member's nickname when hierarchy allows", async () => {
    const member = { id: "t1", roles: { highest: { position: 3 } }, guild: { ownerId: "owner" }, setNickname: vi.fn(async () => {}) };
    const g = guildWith(member);
    const i = {
      guild: g,
      member: { id: "mod1", roles: { highest: { position: 50 } }, guild: { ownerId: "owner" } },
      options: { getUser: () => ({ id: "t1" }), getString: () => "NewName" },
      reply: vi.fn(async () => {}),
    };
    await nick.execute(i, { logger: { error: vi.fn() } });
    expect(member.setNickname).toHaveBeenCalledWith("NewName", expect.any(String));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/moderation/lockNick.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/moderation/commands/lockdown.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock this channel so @everyone cannot send messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) => o.setName("reason").setDescription("Reason")),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ embeds: [successEmbed(`🔒 Channel locked. **Reason:** ${reason}`)] });
    } catch (err) {
      ctx.logger.error({ err }, "lockdown failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't lock this channel.")], ephemeral: true });
    }
  },
};
```

- [ ] **Step 4: Write `src/modules/moderation/commands/unlock.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  permissions: [PermissionFlagsBits.ManageChannels],
  async execute(interaction, ctx) {
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ embeds: [successEmbed("🔓 Channel unlocked.")] });
    } catch (err) {
      ctx.logger.error({ err }, "unlock failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't unlock this channel.")], ephemeral: true });
    }
  },
};
```

- [ ] **Step 5: Write `src/modules/moderation/commands/nick.js`**

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { checkHierarchy } from "../helpers.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change or clear a member's nickname.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("New nickname (leave empty to clear)")),
  permissions: [PermissionFlagsBits.ManageNicknames],
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user");
    const nickname = interaction.options.getString("nickname");
    const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed("That user is not in this server.")], ephemeral: true });
      return;
    }
    const check = checkHierarchy({ actorMember: interaction.member, targetMember, botMember: interaction.guild.members.me });
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed(check.message)], ephemeral: true });
      return;
    }
    try {
      await targetMember.setNickname(nickname ?? null, `Changed by ${interaction.user.id}`);
      await interaction.reply({ embeds: [successEmbed(nickname ? `Nickname set to **${nickname}**.` : "Nickname cleared.")] });
    } catch (err) {
      ctx.logger.error({ err }, "nick failed");
      await interaction.reply({ embeds: [errorEmbed("I couldn't change that nickname.")], ephemeral: true });
    }
  },
};
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/modules/moderation/lockNick.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/moderation/commands/lockdown.js src/modules/moderation/commands/unlock.js src/modules/moderation/commands/nick.js test/modules/moderation/lockNick.test.js
git commit -m "feat(mod): add lockdown, unlock, and nick commands"
```

---

### Task 9: Wire CaseService + expiry job into the bot; docs; full verification

**Files:**
- Modify: `src/bot.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `CaseService` (T1), `registerExpiryJob` (T6), the existing `context` in `src/bot.js`.
- Produces: `context.cases` (a `CaseService`) available to every command; the expiry sweep scheduled on startup.

- [ ] **Step 1: Modify `src/bot.js`** — add imports near the other module imports:

```js
import { CaseService } from "./modules/moderation/CaseService.js";
import { registerExpiryJob } from "./modules/moderation/expiry.js";
```

Add `cases` to the `context` object (alongside `antinuke`):

```js
    cases: new CaseService(prisma),
```

Immediately after `bindEvents(client, listeners, context);`, register the expiry job:

```js
  registerExpiryJob(context);
```

- [ ] **Step 2: Verify wiring (fails only on missing env)**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves all moderation imports resolve and the context/job wiring builds).

- [ ] **Step 3: Update `README.md`** — add a Moderation section before `## Status`:

````markdown
## Moderation

A numbered per-guild case system backs every action. Commands (all permission-gated and
hierarchy-safe): `/ban`, `/unban`, `/tempban`, `/softban`, `/kick`, `/timeout`, `/untimeout`,
`/warn`, `/warnings`, `/case` (view/reason/delete), `/purge`, `/slowmode`, `/lockdown`,
`/unlock`, `/nick`. Temp bans lift automatically via a once-per-minute sweep. Set the
`dmOnAction` toggle (per guild) to DM the target with the reason. Role-based `/mute` arrives
with the config phase; `/timeout` is the native equivalent today.
````

Then update the `## Status` line to:

````markdown
## Status

Foundation + anti-nuke + moderation complete. Remaining modules (logging, config, help) land in
follow-up plans.
````

- [ ] **Step 4: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS (foundation + anti-nuke + moderation); lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/bot.js README.md
git commit -m "feat(mod): wire case service and temp-ban expiry into the bot"
```

---

## Self-Review

**Spec coverage (spec §8 Moderation):**
- Numbered case system (create/view/edit/delete, per-user history) → Tasks 1, 5. ✓
- ban/tempban/softban/unban → Tasks 3, 6. ✓
- kick → Task 3. ✓
- timeout (native) + untimeout → Task 4. ✓
- warn / warnings → Task 5. ✓
- purge/clean → Task 7 (`/purge`). ✓
- lockdown/unlock → Task 8. ✓
- slowmode → Task 7. ✓
- nickname management → Task 8 (`/nick`). ✓
- Hierarchy enforcement via `checkHierarchy`/`canActOn` → Task 2, applied in Tasks 3/4/6/8. ✓
- Timed actions restored/expired by the Scheduler → Task 6 (tempban sweep); timeout expires natively. ✓
- DM-on-action toggle → read from `guildConfig.dmOnAction` in Tasks 3/4/5/6. ✓
- Role-based mute/unmute → **explicitly deferred to Plan 5 (Config)** where mute-role setup lives; noted in README and this plan's intro. Not a coverage gap — a scope decision.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every command has complete code and real tests. ✓

**Type consistency:**
- `CaseService.createCase({ guildId, type, targetId, moderatorId, reason?, expiresAt? })` (T1) matches every command's call. ✓
- `CaseService.dueExpired(now)` / `deactivate(id)` (T1) match `sweepExpired` (T6). ✓
- `checkHierarchy({ actorMember, targetMember, botMember })` (T2) matches call sites in T3/T4/T6/T8. ✓
- `dmTarget(user, embed, logger)` and `buildCaseEmbed(caseRow)` (T2) match all consumers. ✓
- `ctx.cases` (CaseService) and `ctx.config.getGuild` provided by T9 wiring match Tasks 3–8. ✓
- `registerExpiryJob(context)` uses `context.scheduler.every` (foundation Scheduler signature `every(expression, name, task)`) — consistent. ✓
- `ctx.config.getGuild` returns a row with `dmOnAction` (foundation Guild schema) — consistent. ✓
