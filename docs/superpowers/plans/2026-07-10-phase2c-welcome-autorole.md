# Phase 2c — Welcome/Goodbye + Autorole + Reaction Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add member-onboarding features — configurable welcome/goodbye messages, roles auto-assigned on join (autorole), and self-assignable reaction roles — completing Phase 2.

**Architecture:** Pure decision/formatting logic (`renderTemplate`, `parseEmoji`, `processMemberJoin/Leave`, `handleReaction`) separated from Discord/Prisma side-effects via injected deps, matching the established modular-monolith pattern. Welcome config + autoroles live in the cached per-guild config (`ConfigService`), read on `guildMemberAdd`/`guildMemberRemove`. Reaction-role mappings are queried directly through a dedicated `ReactionRoleService` (not in the hot config cache) on `messageReactionAdd`/`messageReactionRemove`.

**Tech Stack:** Node.js 25 ESM, discord.js v14, PostgreSQL + Prisma, Vitest, ESLint 9 flat config.

## Global Constraints

- Node.js 25, `"type": "module"` (ESM), discord.js v14 — copied verbatim from prior phases.
- Slash-commands only; every config command gated by `PermissionFlagsBits.Administrator` (or `ManageRoles` where noted) via `setDefaultMemberPermissions` **and** a `permissions: [...]` array.
- Bot display name is **Joint Jagadeesan** (`BOT_NAME` in `src/lib/constants.js`).
- TDD: failing test → minimal impl → green → commit, one deliverable per task.
- No live Postgres in the build env — generate migration SQL offline with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`; never block pure-logic work on a DB.
- Command shape: `{ data: SlashCommandBuilder, permissions: [bitfields], execute(interaction, ctx) }`. Event shape: `{ name: Events.X, once?: bool, execute(ctx, ...args) }`; multiple listeners per event allowed.
- Reaction events require `GatewayIntentBits.GuildMessageReactions` (non-privileged) and `Partials.Reaction`; add both in `src/bot.js`.

---

### Task 1: Schema + ConfigService + ReactionRoleService

**Files:**
- Modify: `prisma/schema.prisma` (add `WelcomeConfig`, `AutoRole`, `ReactionRole`; add relations to `Guild`)
- Modify: `src/core/ConfigService.js` (INCLUDE + `updateWelcome`, `addAutoRole`, `removeAutoRole`, reset)
- Create: `src/modules/welcome/ReactionRoleService.js`
- Modify: `prisma/migrations/manual_init.sql` (regenerate)
- Test: `test/core/ConfigService.welcome.test.js`, `test/modules/welcome/reactionRoleService.test.js`

**Interfaces:**
- Produces: `ConfigService.updateWelcome(guildId, data) -> row`, `ConfigService.addAutoRole(guildId, roleId) -> row`, `ConfigService.removeAutoRole(guildId, roleId) -> void`. `getGuild` now returns `welcome` (object or null) and `autoRoles` (array of `{ roleId }`).
- Produces: `class ReactionRoleService(prisma)` with `add({ guildId, channelId, messageId, emoji, roleId }) -> row`, `remove(guildId, messageId, emoji) -> void`, `find(guildId, messageId, emoji) -> row|null`, `listForGuild(guildId) -> row[]`.

- [ ] **Step 1: Add Prisma models**

In `prisma/schema.prisma`, add these relations to the `Guild` model (after `automod  AutomodConfig?`):

```prisma
  welcome       WelcomeConfig?
  autoRoles     AutoRole[]
  reactionRoles ReactionRole[]
```

Append three new models at the end of the file:

```prisma
model WelcomeConfig {
  guildId          String  @id
  guild            Guild   @relation(fields: [guildId], references: [id], onDelete: Cascade)
  welcomeEnabled   Boolean @default(false)
  welcomeChannelId String?
  welcomeMessage   String  @default("Welcome {mention} to **{server}**! You are member #{memberCount}.")
  goodbyeEnabled   Boolean @default(false)
  goodbyeChannelId String?
  goodbyeMessage   String  @default("**{user}** has left the server.")
}

model AutoRole {
  id      String @id @default(cuid())
  guildId String
  guild   Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  roleId  String

  @@unique([guildId, roleId])
}

model ReactionRole {
  id        String @id @default(cuid())
  guildId   String
  guild     Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  channelId String
  messageId String
  emoji     String
  roleId    String

  @@unique([guildId, messageId, emoji])
  @@index([guildId, messageId])
}
```

- [ ] **Step 2: Regenerate Prisma client + migration SQL**

Run:
```bash
cd /Users/hrishi/Desktop/Work/discord-bot
npx prisma generate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/manual_init.sql
```
Expected: client generates without error; `manual_init.sql` now contains `CREATE TABLE "WelcomeConfig"`, `"AutoRole"`, `"ReactionRole"`.

- [ ] **Step 3: Write the failing ConfigService test**

Create `test/core/ConfigService.welcome.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "../../src/core/ConfigService.js";

function mockPrisma() {
  return {
    guild: {
      findUnique: vi.fn(async () => ({ id: "g1", welcome: null, autoRoles: [] })),
      create: vi.fn(async ({ data }) => ({ ...data, welcome: null, autoRoles: [] })),
    },
    welcomeConfig: { upsert: vi.fn(async ({ create, update }) => ({ ...create, ...update })) },
    autoRole: {
      upsert: vi.fn(async ({ create }) => create),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe("ConfigService welcome/autorole", () => {
  it("upserts welcome config and invalidates cache", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.getGuild("g1");
    await svc.updateWelcome("g1", { welcomeEnabled: true, welcomeChannelId: "c1" });
    expect(prisma.welcomeConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: "g1" } }),
    );
    // cache was invalidated → next read hits findUnique again
    await svc.getGuild("g1");
    expect(prisma.guild.findUnique).toHaveBeenCalledTimes(2);
  });

  it("adds and removes an autorole", async () => {
    const prisma = mockPrisma();
    const svc = new ConfigService(prisma);
    await svc.addAutoRole("g1", "r1");
    expect(prisma.autoRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId_roleId: { guildId: "g1", roleId: "r1" } } }),
    );
    await svc.removeAutoRole("g1", "r1");
    expect(prisma.autoRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", roleId: "r1" },
    });
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `npx vitest run test/core/ConfigService.welcome.test.js`
Expected: FAIL (`updateWelcome is not a function`).

- [ ] **Step 5: Extend ConfigService**

In `src/core/ConfigService.js`, update the `INCLUDE` constant:

```js
const INCLUDE = {
  antinuke: true,
  automod: true,
  logging: true,
  modRoles: true,
  whitelist: true,
  welcome: true,
  autoRoles: true,
};
```

Add these methods (after `updateAutomod`):

```js
  async updateWelcome(guildId, data) {
    await this.getGuild(guildId);
    const row = await this.prisma.welcomeConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    this.invalidate(guildId);
    return row;
  }

  async addAutoRole(guildId, roleId) {
    await this.getGuild(guildId);
    const row = await this.prisma.autoRole.upsert({
      where: { guildId_roleId: { guildId, roleId } },
      create: { guildId, roleId },
      update: {},
    });
    this.invalidate(guildId);
    return row;
  }

  async removeAutoRole(guildId, roleId) {
    await this.prisma.autoRole.deleteMany({ where: { guildId, roleId } });
    this.invalidate(guildId);
  }
```

Also extend `resetGuildConfig` to clear the new tables — add before the `guild.update` call:

```js
    await this.prisma.welcomeConfig.deleteMany({ where: { guildId } });
    await this.prisma.autoRole.deleteMany({ where: { guildId } });
```

- [ ] **Step 6: Run ConfigService tests, verify pass**

Run: `npx vitest run test/core/ConfigService.welcome.test.js test/core/ConfigService.test.js`
Expected: PASS (all).

- [ ] **Step 7: Write the failing ReactionRoleService test**

Create `test/modules/welcome/reactionRoleService.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { ReactionRoleService } from "../../../src/modules/welcome/ReactionRoleService.js";

function prismaMock() {
  return {
    reactionRole: {
      upsert: vi.fn(async ({ create }) => ({ id: "rr1", ...create })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ id: "rr1", roleId: "role1" })),
      findMany: vi.fn(async () => [{ id: "rr1" }]),
    },
  };
}

describe("ReactionRoleService", () => {
  it("upserts a mapping keyed by guild+message+emoji", async () => {
    const prisma = prismaMock();
    const svc = new ReactionRoleService(prisma);
    await svc.add({ guildId: "g1", channelId: "c1", messageId: "m1", emoji: "😀", roleId: "role1" });
    expect(prisma.reactionRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId_messageId_emoji: { guildId: "g1", messageId: "m1", emoji: "😀" } },
      }),
    );
  });

  it("finds a mapping", async () => {
    const svc = new ReactionRoleService(prismaMock());
    const rr = await svc.find("g1", "m1", "😀");
    expect(rr.roleId).toBe("role1");
  });

  it("removes by guild+message+emoji", async () => {
    const prisma = prismaMock();
    await new ReactionRoleService(prisma).remove("g1", "m1", "😀");
    expect(prisma.reactionRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: "g1", messageId: "m1", emoji: "😀" },
    });
  });
});
```

- [ ] **Step 8: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/reactionRoleService.test.js`
Expected: FAIL (module not found).

- [ ] **Step 9: Implement ReactionRoleService**

Create `src/modules/welcome/ReactionRoleService.js`:

```js
export class ReactionRoleService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async add({ guildId, channelId, messageId, emoji, roleId }) {
    return this.prisma.reactionRole.upsert({
      where: { guildId_messageId_emoji: { guildId, messageId, emoji } },
      create: { guildId, channelId, messageId, emoji, roleId },
      update: { roleId, channelId },
    });
  }

  async remove(guildId, messageId, emoji) {
    await this.prisma.reactionRole.deleteMany({ where: { guildId, messageId, emoji } });
  }

  async find(guildId, messageId, emoji) {
    return this.prisma.reactionRole.findUnique({
      where: { guildId_messageId_emoji: { guildId, messageId, emoji } },
    });
  }

  async listForGuild(guildId) {
    return this.prisma.reactionRole.findMany({ where: { guildId } });
  }
}
```

- [ ] **Step 10: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/reactionRoleService.test.js`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add prisma/ src/core/ConfigService.js src/modules/welcome/ReactionRoleService.js test/core/ConfigService.welcome.test.js test/modules/welcome/reactionRoleService.test.js
git commit -m "feat(welcome): schema + config + reaction-role persistence"
```

---

### Task 2: Template rendering + emoji parsing

**Files:**
- Create: `src/modules/welcome/render.js`
- Test: `test/modules/welcome/render.test.js`

**Interfaces:**
- Produces: `renderTemplate(template, { member, guild }) -> string`. Placeholders: `{mention}`→`<@id>`, `{user}`→tag, `{username}`→username, `{server}`→guild name, `{memberCount}`→count.
- Produces: `parseEmoji(input) -> { react, key }`. Custom `<a?:name:id>` → `{ react: id, key: id }`; unicode → `{ react: input, key: input }`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/render.test.js`:

```js
import { describe, it, expect } from "vitest";
import { renderTemplate, parseEmoji } from "../../../src/modules/welcome/render.js";

const member = { id: "u1", user: { tag: "Ann#0001", username: "Ann" } };
const guild = { name: "Cool Server", memberCount: 42 };

describe("renderTemplate", () => {
  it("replaces every placeholder", () => {
    const out = renderTemplate(
      "Hi {mention} ({user}/{username}) welcome to {server} #{memberCount}",
      { member, guild },
    );
    expect(out).toBe("Hi <@u1> (Ann#0001/Ann) welcome to Cool Server #42");
  });
  it("handles repeated placeholders and empty template", () => {
    expect(renderTemplate("{server} {server}", { member, guild })).toBe("Cool Server Cool Server");
    expect(renderTemplate("", { member, guild })).toBe("");
    expect(renderTemplate(null, { member, guild })).toBe("");
  });
  it("falls back gracefully when user fields are missing", () => {
    const bare = { id: "u9", user: {} };
    const out = renderTemplate("{user}-{username}-{mention}", { member: bare, guild });
    expect(out).toBe("u9-member-<@u9>");
  });
});

describe("parseEmoji", () => {
  it("parses a custom emoji to its id", () => {
    expect(parseEmoji("<:smile:12345>")).toEqual({ react: "12345", key: "12345" });
    expect(parseEmoji("<a:party:98765>")).toEqual({ react: "98765", key: "98765" });
  });
  it("passes a unicode emoji through", () => {
    expect(parseEmoji("😀")).toEqual({ react: "😀", key: "😀" });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/render.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement render.js**

Create `src/modules/welcome/render.js`:

```js
export function renderTemplate(template, { member, guild }) {
  return String(template ?? "")
    .replaceAll("{mention}", `<@${member.id}>`)
    .replaceAll("{user}", member.user?.tag ?? member.id)
    .replaceAll("{username}", member.user?.username ?? "member")
    .replaceAll("{server}", guild.name ?? "the server")
    .replaceAll("{memberCount}", String(guild.memberCount ?? 0));
}

const CUSTOM_EMOJI = /^<a?:\w+:(\d+)>$/;

export function parseEmoji(input) {
  const m = input.match(CUSTOM_EMOJI);
  if (m) return { react: m[1], key: m[1] };
  return { react: input, key: input };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/welcome/render.js test/modules/welcome/render.test.js
git commit -m "feat(welcome): message template rendering + emoji parsing"
```

---

### Task 3: Member join/leave processing + listeners

**Files:**
- Create: `src/modules/welcome/members.js` (pure-ish `processMemberJoin`, `processMemberLeave`)
- Create: `src/modules/welcome/deps.js` (real side-effect deps factory)
- Create: `src/modules/welcome/events/guildMemberAdd.js`
- Create: `src/modules/welcome/events/guildMemberRemove.js`
- Test: `test/modules/welcome/members.test.js`

**Interfaces:**
- Consumes: `renderTemplate` (Task 2); `ctx.config.getGuild` returns `{ welcome, autoRoles }` (Task 1).
- Produces: `processMemberJoin({ member, guildConfig, deps, logger }) -> Promise<void>`; `processMemberLeave({ member, guildConfig, deps, logger }) -> Promise<void>`. `deps = { assignRoles(member, roleIds), sendMessage(guild, channelId, content) }`.
- Produces: `realDeps(logger) -> deps` in `deps.js`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/members.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { processMemberJoin, processMemberLeave } from "../../../src/modules/welcome/members.js";

const guild = { id: "g1", name: "Srv", memberCount: 5 };
const member = { id: "u1", user: { tag: "A#1", username: "A" }, guild };
const logger = { error: vi.fn() };

function deps() {
  return { assignRoles: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}) };
}

describe("processMemberJoin", () => {
  it("assigns autoroles and posts the welcome message", async () => {
    const d = deps();
    await processMemberJoin({
      member,
      guildConfig: {
        autoRoles: [{ roleId: "r1" }, { roleId: "r2" }],
        welcome: { welcomeEnabled: true, welcomeChannelId: "c1", welcomeMessage: "hi {username}" },
      },
      deps: d,
      logger,
    });
    expect(d.assignRoles).toHaveBeenCalledWith(member, ["r1", "r2"]);
    expect(d.sendMessage).toHaveBeenCalledWith(guild, "c1", "hi A");
  });

  it("skips the welcome message when disabled, still autoroles", async () => {
    const d = deps();
    await processMemberJoin({
      member,
      guildConfig: { autoRoles: [{ roleId: "r1" }], welcome: { welcomeEnabled: false } },
      deps: d,
      logger,
    });
    expect(d.assignRoles).toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("does nothing when there is no config", async () => {
    const d = deps();
    await processMemberJoin({ member, guildConfig: {}, deps: d, logger });
    expect(d.assignRoles).not.toHaveBeenCalled();
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("swallows errors and logs them", async () => {
    const d = deps();
    d.assignRoles.mockRejectedValueOnce(new Error("boom"));
    await processMemberJoin({
      member,
      guildConfig: { autoRoles: [{ roleId: "r1" }], welcome: {} },
      deps: d,
      logger,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("processMemberLeave", () => {
  it("posts the goodbye message when enabled", async () => {
    const d = deps();
    await processMemberLeave({
      member,
      guildConfig: { welcome: { goodbyeEnabled: true, goodbyeChannelId: "c2", goodbyeMessage: "bye {user}" } },
      deps: d,
      logger,
    });
    expect(d.sendMessage).toHaveBeenCalledWith(guild, "c2", "bye A#1");
  });

  it("does nothing when goodbye is disabled", async () => {
    const d = deps();
    await processMemberLeave({
      member,
      guildConfig: { welcome: { goodbyeEnabled: false } },
      deps: d,
      logger,
    });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/members.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement members.js**

Create `src/modules/welcome/members.js`:

```js
import { renderTemplate } from "./render.js";

const DEFAULT_WELCOME = "Welcome {mention} to **{server}**! You are member #{memberCount}.";
const DEFAULT_GOODBYE = "**{user}** has left the server.";

export async function processMemberJoin({ member, guildConfig, deps, logger }) {
  try {
    const roleIds = (guildConfig.autoRoles ?? []).map((r) => r.roleId);
    if (roleIds.length) await deps.assignRoles(member, roleIds);

    const w = guildConfig.welcome;
    if (w?.welcomeEnabled && w.welcomeChannelId) {
      const text = renderTemplate(w.welcomeMessage || DEFAULT_WELCOME, {
        member,
        guild: member.guild,
      });
      await deps.sendMessage(member.guild, w.welcomeChannelId, text);
    }
  } catch (err) {
    logger.error({ err, guildId: member.guild?.id }, "welcome join processing failed");
  }
}

export async function processMemberLeave({ member, guildConfig, deps, logger }) {
  try {
    const w = guildConfig.welcome;
    if (w?.goodbyeEnabled && w.goodbyeChannelId) {
      const text = renderTemplate(w.goodbyeMessage || DEFAULT_GOODBYE, {
        member,
        guild: member.guild,
      });
      await deps.sendMessage(member.guild, w.goodbyeChannelId, text);
    }
  } catch (err) {
    logger.error({ err, guildId: member.guild?.id }, "welcome leave processing failed");
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/members.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the side-effect deps + listeners**

Create `src/modules/welcome/deps.js`:

```js
export function realDeps(logger) {
  return {
    async assignRoles(member, roleIds) {
      try {
        await member.roles.add(roleIds, "Autorole on join");
      } catch (err) {
        logger.error({ err }, "autorole assignment failed");
      }
    },
    async sendMessage(guild, channelId, content) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ content, allowedMentions: { parse: ["users"] } }).catch(() => {});
      }
    },
  };
}
```

Create `src/modules/welcome/events/guildMemberAdd.js`:

```js
import { Events } from "discord.js";
import { processMemberJoin } from "../members.js";
import { realDeps } from "../deps.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    const guildConfig = await ctx.config.getGuild(member.guild.id);
    await processMemberJoin({ member, guildConfig, deps: realDeps(ctx.logger), logger: ctx.logger });
  },
};
```

Create `src/modules/welcome/events/guildMemberRemove.js`:

```js
import { Events } from "discord.js";
import { processMemberLeave } from "../members.js";
import { realDeps } from "../deps.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    const guildConfig = await ctx.config.getGuild(member.guild.id);
    await processMemberLeave({ member, guildConfig, deps: realDeps(ctx.logger), logger: ctx.logger });
  },
};
```

- [ ] **Step 6: Run the module tests, verify pass**

Run: `npx vitest run test/modules/welcome/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/welcome/members.js src/modules/welcome/deps.js src/modules/welcome/events/ test/modules/welcome/members.test.js
git commit -m "feat(welcome): join/leave listeners for welcome, goodbye, autorole"
```

---

### Task 4: Reaction-role handling + listeners

**Files:**
- Create: `src/modules/welcome/reactions.js` (pure-ish `handleReaction`)
- Create: `src/modules/welcome/events/messageReactionAdd.js`
- Create: `src/modules/welcome/events/messageReactionRemove.js`
- Test: `test/modules/welcome/reactions.test.js`

**Interfaces:**
- Consumes: `ReactionRoleService.find` (Task 1); `parseEmoji` key convention (Task 2).
- Produces: `handleReaction({ reaction, user, action, service, resolveMember, assignRole, removeRole, logger }) -> Promise<void>`. `action` is `"add"` or `"remove"`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/reactions.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { handleReaction } from "../../../src/modules/welcome/reactions.js";

const logger = { error: vi.fn() };

function baseArgs(over = {}) {
  const member = { id: "u1" };
  return {
    reaction: {
      partial: false,
      emoji: { id: null, name: "😀" },
      message: { id: "m1", guildId: "g1", guild: { id: "g1" } },
    },
    user: { id: "u1", bot: false },
    action: "add",
    service: { find: vi.fn(async () => ({ roleId: "role1" })) },
    resolveMember: vi.fn(async () => member),
    assignRole: vi.fn(async () => {}),
    removeRole: vi.fn(async () => {}),
    logger,
    ...over,
  };
}

describe("handleReaction", () => {
  it("assigns the mapped role on add", async () => {
    const a = baseArgs();
    await handleReaction(a);
    expect(a.service.find).toHaveBeenCalledWith("g1", "m1", "😀");
    expect(a.assignRole).toHaveBeenCalledWith({ id: "u1" }, "role1");
  });

  it("removes the mapped role on remove", async () => {
    const a = baseArgs({ action: "remove" });
    await handleReaction(a);
    expect(a.removeRole).toHaveBeenCalledWith({ id: "u1" }, "role1");
  });

  it("uses the custom emoji id as the key", async () => {
    const a = baseArgs({
      reaction: { partial: false, emoji: { id: "999", name: "smile" }, message: { id: "m1", guildId: "g1", guild: { id: "g1" } } },
    });
    await handleReaction(a);
    expect(a.service.find).toHaveBeenCalledWith("g1", "m1", "999");
  });

  it("ignores bot reactions", async () => {
    const a = baseArgs({ user: { id: "b", bot: true } });
    await handleReaction(a);
    expect(a.service.find).not.toHaveBeenCalled();
  });

  it("does nothing when no mapping exists", async () => {
    const a = baseArgs({ service: { find: vi.fn(async () => null) } });
    await handleReaction(a);
    expect(a.assignRole).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/reactions.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement reactions.js**

Create `src/modules/welcome/reactions.js`:

```js
export async function handleReaction({
  reaction,
  user,
  action,
  service,
  resolveMember,
  assignRole,
  removeRole,
  logger,
}) {
  try {
    if (user.bot) return;
    const guildId = reaction.message.guild?.id ?? reaction.message.guildId;
    if (!guildId) return;

    const key = reaction.emoji.id ?? reaction.emoji.name;
    const mapping = await service.find(guildId, reaction.message.id, key);
    if (!mapping) return;

    const member = await resolveMember(guildId, user.id);
    if (!member) return;

    if (action === "add") await assignRole(member, mapping.roleId);
    else await removeRole(member, mapping.roleId);
  } catch (err) {
    logger.error({ err }, "reaction-role handling failed");
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/reactions.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the listeners**

Create `src/modules/welcome/events/messageReactionAdd.js`:

```js
import { Events } from "discord.js";
import { handleReaction } from "../reactions.js";

async function resolveMember(ctx) {
  return async (guildId, userId) => {
    const guild = await ctx.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;
    return guild.members.fetch(userId).catch(() => null);
  };
}

export default {
  name: Events.MessageReactionAdd,
  async execute(ctx, reaction, user) {
    if (reaction.partial) {
      const ok = await reaction.fetch().catch(() => null);
      if (!ok) return;
    }
    await handleReaction({
      reaction,
      user,
      action: "add",
      service: ctx.reactionRoles,
      resolveMember: await resolveMember(ctx),
      assignRole: (member, roleId) => member.roles.add(roleId, "Reaction role").catch(() => {}),
      removeRole: (member, roleId) => member.roles.remove(roleId, "Reaction role").catch(() => {}),
      logger: ctx.logger,
    });
  },
};
```

Create `src/modules/welcome/events/messageReactionRemove.js` (same, but `Events.MessageReactionRemove` and `action: "remove"`):

```js
import { Events } from "discord.js";
import { handleReaction } from "../reactions.js";

async function resolveMember(ctx) {
  return async (guildId, userId) => {
    const guild = await ctx.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;
    return guild.members.fetch(userId).catch(() => null);
  };
}

export default {
  name: Events.MessageReactionRemove,
  async execute(ctx, reaction, user) {
    if (reaction.partial) {
      const ok = await reaction.fetch().catch(() => null);
      if (!ok) return;
    }
    await handleReaction({
      reaction,
      user,
      action: "remove",
      service: ctx.reactionRoles,
      resolveMember: await resolveMember(ctx),
      assignRole: (member, roleId) => member.roles.add(roleId, "Reaction role").catch(() => {}),
      removeRole: (member, roleId) => member.roles.remove(roleId, "Reaction role").catch(() => {}),
      logger: ctx.logger,
    });
  },
};
```

- [ ] **Step 6: Run the module tests, verify pass**

Run: `npx vitest run test/modules/welcome/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/welcome/reactions.js src/modules/welcome/events/messageReactionAdd.js src/modules/welcome/events/messageReactionRemove.js test/modules/welcome/reactions.test.js
git commit -m "feat(welcome): reaction-role add/remove listeners"
```

---

### Task 5: `/welcome` and `/autorole` commands

**Files:**
- Create: `src/modules/welcome/commands/welcome.js`
- Create: `src/modules/welcome/commands/autorole.js`
- Test: `test/modules/welcome/welcomeCommand.test.js`

**Interfaces:**
- Consumes: `ctx.config.updateWelcome`, `ctx.config.addAutoRole`, `ctx.config.removeAutoRole`, `ctx.config.getGuild` (Task 1); `successEmbed`/`errorEmbed`/`infoEmbed` from `src/lib/embeds.js`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/welcomeCommand.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import welcome from "../../../src/modules/welcome/commands/welcome.js";
import autorole from "../../../src/modules/welcome/commands/autorole.js";

function ctx(guild = {}) {
  return {
    config: {
      updateWelcome: vi.fn(async () => ({})),
      addAutoRole: vi.fn(async () => ({})),
      removeAutoRole: vi.fn(async () => {}),
      getGuild: vi.fn(async () => guild),
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
      getChannel: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/welcome", () => {
  it("is admin-gated", () => {
    expect(welcome.data.name).toBe("welcome");
    expect(welcome.permissions.length).toBe(1);
  });
  it("set-channel enables welcome and stores the channel", async () => {
    const c = ctx();
    await welcome.execute(interaction("set-channel", { channel: { id: "c1" } }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      welcomeEnabled: true,
      welcomeChannelId: "c1",
    });
  });
  it("set-message stores the template", async () => {
    const c = ctx();
    await welcome.execute(interaction("set-message", { text: "hi {user}" }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", { welcomeMessage: "hi {user}" });
  });
  it("goodbye-channel enables goodbye and stores the channel", async () => {
    const c = ctx();
    await welcome.execute(interaction("goodbye-channel", { channel: { id: "c2" } }), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      goodbyeEnabled: true,
      goodbyeChannelId: "c2",
    });
  });
  it("disable turns both off", async () => {
    const c = ctx();
    await welcome.execute(interaction("disable"), c);
    expect(c.config.updateWelcome).toHaveBeenCalledWith("g1", {
      welcomeEnabled: false,
      goodbyeEnabled: false,
    });
  });
});

describe("/autorole", () => {
  it("add stores a role", async () => {
    const c = ctx();
    await autorole.execute(interaction("add", { role: { id: "r1" } }), c);
    expect(c.config.addAutoRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("remove deletes a role", async () => {
    const c = ctx();
    await autorole.execute(interaction("remove", { role: { id: "r1" } }), c);
    expect(c.config.removeAutoRole).toHaveBeenCalledWith("g1", "r1");
  });
  it("list replies with an embed", async () => {
    const c = ctx({ autoRoles: [{ roleId: "r1" }] });
    const i = interaction("list");
    await autorole.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/welcomeCommand.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement welcome.js**

Create `src/modules/welcome/commands/welcome.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, infoEmbed } from "../../../lib/embeds.js";

const PLACEHOLDERS = "`{mention}` `{user}` `{username}` `{server}` `{memberCount}`";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome & goodbye messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("set-channel")
        .setDescription("Set the welcome channel (enables welcomes).")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set-message")
        .setDescription("Set the welcome message template.")
        .addStringOption((o) =>
          o.setName("text").setDescription("Template — supports placeholders").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("goodbye-channel")
        .setDescription("Set the goodbye channel (enables goodbyes).")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("goodbye-message")
        .setDescription("Set the goodbye message template.")
        .addStringOption((o) =>
          o.setName("text").setDescription("Template — supports placeholders").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("disable").setDescription("Disable both welcome and goodbye messages."),
    )
    .addSubcommand((s) => s.setName("view").setDescription("Show current welcome/goodbye settings.")),
  permissions: [PermissionFlagsBits.Administrator],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "set-channel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateWelcome(guildId, { welcomeEnabled: true, welcomeChannelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed(`Welcome messages will be sent to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "set-message") {
      const text = interaction.options.getString("text");
      await ctx.config.updateWelcome(guildId, { welcomeMessage: text });
      await interaction.reply({
        embeds: [successEmbed(`Welcome message updated.\nPlaceholders: ${PLACEHOLDERS}`)],
      });
      return;
    }
    if (sub === "goodbye-channel") {
      const channel = interaction.options.getChannel("channel");
      await ctx.config.updateWelcome(guildId, { goodbyeEnabled: true, goodbyeChannelId: channel.id });
      await interaction.reply({
        embeds: [successEmbed(`Goodbye messages will be sent to <#${channel.id}>.`)],
      });
      return;
    }
    if (sub === "goodbye-message") {
      const text = interaction.options.getString("text");
      await ctx.config.updateWelcome(guildId, { goodbyeMessage: text });
      await interaction.reply({
        embeds: [successEmbed(`Goodbye message updated.\nPlaceholders: ${PLACEHOLDERS}`)],
      });
      return;
    }
    if (sub === "disable") {
      await ctx.config.updateWelcome(guildId, { welcomeEnabled: false, goodbyeEnabled: false });
      await interaction.reply({ embeds: [successEmbed("Welcome & goodbye messages disabled.")] });
      return;
    }
    if (sub === "view") {
      const { welcome } = await ctx.config.getGuild(guildId);
      const w = welcome ?? {};
      const lines = [
        `**Welcome:** ${w.welcomeEnabled ? `on → <#${w.welcomeChannelId}>` : "off"}`,
        w.welcomeMessage ? `> ${w.welcomeMessage}` : null,
        `**Goodbye:** ${w.goodbyeEnabled ? `on → <#${w.goodbyeChannelId}>` : "off"}`,
        w.goodbyeMessage ? `> ${w.goodbyeMessage}` : null,
        `\nPlaceholders: ${PLACEHOLDERS}`,
      ].filter(Boolean);
      await interaction.reply({ embeds: [infoEmbed("Welcome settings", lines.join("\n"))] });
    }
  },
};
```

- [ ] **Step 4: Implement autorole.js**

Create `src/modules/welcome/commands/autorole.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, infoEmbed } from "../../../lib/embeds.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Roles automatically given to new members.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a role to auto-assign on join.")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop auto-assigning a role.")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List the auto-assigned roles.")),
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const role = interaction.options.getRole("role");
      await ctx.config.addAutoRole(guildId, role.id);
      await interaction.reply({ embeds: [successEmbed(`<@&${role.id}> will be given to new members.`)] });
      return;
    }
    if (sub === "remove") {
      const role = interaction.options.getRole("role");
      await ctx.config.removeAutoRole(guildId, role.id);
      await interaction.reply({ embeds: [successEmbed(`<@&${role.id}> removed from autoroles.`)] });
      return;
    }
    if (sub === "list") {
      const { autoRoles } = await ctx.config.getGuild(guildId);
      const list = (autoRoles ?? []).map((r) => `<@&${r.roleId}>`).join(", ") || "_None set._";
      await interaction.reply({ embeds: [infoEmbed("Autoroles", list)] });
    }
  },
};
```

- [ ] **Step 5: Verify `infoEmbed` signature**

Run: `grep -n "export function infoEmbed" src/lib/embeds.js`
Expected: shows the signature. If `infoEmbed` takes `(title, description)`, the calls above are correct; if it takes a single string, adjust both commands to `infoEmbed(text)` before running tests.

- [ ] **Step 6: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/welcomeCommand.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/welcome/commands/welcome.js src/modules/welcome/commands/autorole.js test/modules/welcome/welcomeCommand.test.js
git commit -m "feat(welcome): /welcome and /autorole config commands"
```

---

### Task 6: `/reactionrole` command

**Files:**
- Create: `src/modules/welcome/commands/reactionrole.js`
- Test: `test/modules/welcome/reactionRoleCommand.test.js`

**Interfaces:**
- Consumes: `ctx.reactionRoles` (a `ReactionRoleService`, wired in Task 7); `parseEmoji` (Task 2); `successEmbed`/`errorEmbed`/`infoEmbed`.

- [ ] **Step 1: Write the failing test**

Create `test/modules/welcome/reactionRoleCommand.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import command from "../../../src/modules/welcome/commands/reactionrole.js";

function ctx() {
  return {
    reactionRoles: {
      add: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
      listForGuild: vi.fn(async () => [{ messageId: "m1", emoji: "😀", roleId: "role1" }]),
    },
    logger: { error: vi.fn() },
  };
}

function interaction(sub, opts = {}) {
  const message = { id: "m1", react: vi.fn(async () => {}) };
  return {
    guildId: "g1",
    channelId: "c1",
    channel: { messages: { fetch: vi.fn(async () => message) } },
    _message: message,
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getRole: (k) => opts[k] ?? null,
    },
    reply: vi.fn(async () => {}),
  };
}

describe("/reactionrole", () => {
  it("is admin-gated", () => {
    expect(command.data.name).toBe("reactionrole");
    expect(command.permissions.length).toBe(1);
  });

  it("add reacts to the message and stores the mapping", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "m1", emoji: "😀", role: { id: "role1" } });
    await command.execute(i, c);
    expect(i._message.react).toHaveBeenCalledWith("😀");
    expect(c.reactionRoles.add).toHaveBeenCalledWith({
      guildId: "g1",
      channelId: "c1",
      messageId: "m1",
      emoji: "😀",
      roleId: "role1",
    });
  });

  it("add uses the custom-emoji id as the stored key", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "m1", emoji: "<:smile:999>", role: { id: "role1" } });
    await command.execute(i, c);
    expect(i._message.react).toHaveBeenCalledWith("999");
    expect(c.reactionRoles.add).toHaveBeenCalledWith(expect.objectContaining({ emoji: "999" }));
  });

  it("remove deletes the mapping", async () => {
    const c = ctx();
    const i = interaction("remove", { message_id: "m1", emoji: "😀" });
    await command.execute(i, c);
    expect(c.reactionRoles.remove).toHaveBeenCalledWith("g1", "m1", "😀");
  });

  it("list replies with an embed", async () => {
    const c = ctx();
    const i = interaction("list");
    await command.execute(i, c);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it("replies with an error when the message is not found", async () => {
    const c = ctx();
    const i = interaction("add", { message_id: "bad", emoji: "😀", role: { id: "role1" } });
    i.channel.messages.fetch = vi.fn(async () => {
      throw new Error("Unknown Message");
    });
    await command.execute(i, c);
    expect(c.reactionRoles.add).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array), ephemeral: true }),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/modules/welcome/reactionRoleCommand.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement reactionrole.js**

Create `src/modules/welcome/commands/reactionrole.js`:

```js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { successEmbed, errorEmbed, infoEmbed } from "../../../lib/embeds.js";
import { parseEmoji } from "../render.js";

export default {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Self-assignable roles via message reactions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Bind an emoji reaction on a message to a role (run in the message's channel).")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Target message ID").setRequired(true),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a reaction-role binding.")
        .addStringOption((o) =>
          o.setName("message_id").setDescription("Target message ID").setRequired(true),
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List reaction-role bindings.")),
  permissions: [PermissionFlagsBits.ManageRoles],
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const messageId = interaction.options.getString("message_id");
      const role = interaction.options.getRole("role");
      const { react, key } = parseEmoji(interaction.options.getString("emoji"));
      const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        await interaction.reply({
          embeds: [errorEmbed("Message not found in this channel. Run the command where the message is.")],
          ephemeral: true,
        });
        return;
      }
      await message.react(react).catch(() => {});
      await ctx.reactionRoles.add({
        guildId,
        channelId: interaction.channelId,
        messageId,
        emoji: key,
        roleId: role.id,
      });
      await interaction.reply({
        embeds: [successEmbed(`Reacting with that emoji on the message now grants <@&${role.id}>.`)],
      });
      return;
    }

    if (sub === "remove") {
      const messageId = interaction.options.getString("message_id");
      const { key } = parseEmoji(interaction.options.getString("emoji"));
      await ctx.reactionRoles.remove(guildId, messageId, key);
      await interaction.reply({ embeds: [successEmbed("Reaction-role binding removed.")] });
      return;
    }

    if (sub === "list") {
      const rows = await ctx.reactionRoles.listForGuild(guildId);
      const body =
        rows.length === 0
          ? "_No reaction roles set._"
          : rows
              .map((r) => {
                const emoji = /^\d+$/.test(r.emoji) ? `<:rr:${r.emoji}>` : r.emoji;
                return `${emoji} → <@&${r.roleId}> (msg \`${r.messageId}\`)`;
              })
              .join("\n");
      await interaction.reply({ embeds: [infoEmbed("Reaction roles", body)] });
    }
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/modules/welcome/reactionRoleCommand.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/welcome/commands/reactionrole.js test/modules/welcome/reactionRoleCommand.test.js
git commit -m "feat(welcome): /reactionrole command"
```

---

### Task 7: Wiring, intents, docs & full verification

**Files:**
- Modify: `src/bot.js` (intent + partial + `reactionRoles` in context)
- Modify: `README.md` (feature list)
- Modify: `docs/superpowers/specs/2026-07-09-discord-bot-design.md` (mark Phase 2 complete — if a status section exists)

**Interfaces:**
- Consumes: `ReactionRoleService` (Task 1). Produces: `ctx.reactionRoles` for the reaction listeners (Task 4) and `/reactionrole` (Task 6).

- [ ] **Step 1: Add the intent, partial, service to bot.js**

In `src/bot.js`, add the import near the other module imports:

```js
import { ReactionRoleService } from "./modules/welcome/ReactionRoleService.js";
```

Add to the `intents` array (after `GatewayIntentBits.MessageContent`):

```js
      GatewayIntentBits.GuildMessageReactions,
```

Change the `partials` array to include `Partials.Reaction`:

```js
    partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel, Partials.Reaction],
```

Add to the `context` object (after `automod: new AutomodState(),`):

```js
    reactionRoles: new ReactionRoleService(prisma),
```

- [ ] **Step 2: Verify the bot boots (loaders + wiring)**

Run:
```bash
cd /Users/hrishi/Desktop/Work/discord-bot
node --input-type=module -e '
const R="/Users/hrishi/Desktop/Work/discord-bot";
const { discoverCommands, buildCommandMap } = await import(R+"/src/core/CommandHandler.js");
const { discoverEvents } = await import(R+"/src/core/EventHandler.js");
const cmds = buildCommandMap(await discoverCommands(R+"/src/modules"));
const evs = await discoverEvents(R+"/src/modules");
console.log("commands:", cmds.size);
console.log("has welcome/autorole/reactionrole:", ["welcome","autorole","reactionrole"].every(n=>cmds.has(n)));
const names = [...cmds.values()].map(c=>c.data.toJSON().name);
console.log("all valid JSON:", names.length === new Set(names).size);
console.log("listeners:", evs.length);
console.log("reaction listeners:", evs.filter(e=>String(e.name).includes("Reaction")).length);
'
```
Expected: `commands: 27`, `has ...: true`, `all valid JSON: true`, reaction listeners `2`.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS (prior 226 + the new welcome tests).

- [ ] **Step 4: Lint & format**

Run:
```bash
npx eslint src test
npx prettier --check "src/**/*.js" "test/**/*.js"
```
Expected: no errors. If Prettier flags files, run `npx prettier --write` on them and re-check.

- [ ] **Step 5: Update README**

In `README.md`, add to the features list a **Welcome & Onboarding** entry describing: configurable welcome/goodbye messages with `{mention}/{user}/{username}/{server}/{memberCount}` placeholders (`/welcome`), autoroles on join (`/autorole`), and reaction roles (`/reactionrole`). Note the added `GuildMessageReactions` intent (non-privileged, no portal toggle needed).

- [ ] **Step 6: Commit**

```bash
git add src/bot.js README.md docs/
git commit -m "feat(welcome): wire reaction-role service + GuildMessageReactions intent; docs"
```

- [ ] **Step 7: Finish the branch**

Announce and use superpowers:finishing-a-development-branch — verify `npx vitest run` is green, then merge `feat/welcome-autorole` to `main` with `git merge --ff-only` and delete the branch. Update the project memory file to mark **Phase 2 COMPLETE** with the new command/test counts.

---

## Self-Review

- **Spec coverage:** welcome/goodbye (Tasks 3, 5) ✓; autorole on join (Tasks 3, 5) ✓; reaction roles (Tasks 4, 6) ✓; persistence (Task 1) ✓; intents/wiring (Task 7) ✓. Completes Phase 2.
- **Placeholder scan:** all steps carry real code/commands; no TBD/TODO.
- **Type consistency:** `parseEmoji` returns `{ react, key }` used identically in Tasks 4 & 6; reaction key convention (`emoji.id ?? emoji.name`) matches the stored `key`; `ctx.reactionRoles` produced in Task 7 consumed in Tasks 4 & 6; `updateWelcome/addAutoRole/removeAutoRole` signatures consistent between Task 1 and Task 5. `infoEmbed(title, description)` usage is guarded by the Task 5 Step 5 signature check.
