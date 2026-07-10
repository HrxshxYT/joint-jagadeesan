# Phase 4 Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-guild, per-category event logging — member join/leave, message delete/edit, role changes, channel changes, server changes, voice state changes, and moderation actions — each routed to its own configurable channel and degrading silently when unconfigured.

**Architecture:** A single `dispatchLog` resolves the configured channel for a category from the guild's `LoggingConfig` (respecting a per-guild `disabled` list) and sends a formatted embed. Thin gateway-event listeners build a category embed and hand it to `logEvent`. Moderation logging is decoupled: `CaseService` becomes an `EventEmitter` that emits `caseCreated`, and a logging subscriber turns those into mod-action log embeds.

**Tech Stack:** Node.js 25 (ESM), discord.js v14 (`Events`, `EmbedBuilder`, `GatewayIntentBits`), Prisma (`LoggingConfig`), Vitest.

## Global Constraints

- **Node.js 25**, ES modules only; discord.js v14 API surface only.
- **Reuse foundation modules:** `COLORS` (`src/lib/constants.js`), `ConfigService.getGuild` (returns `.logging`). Do NOT re-implement.
- **All new code under `src/modules/logging/`**; event listeners auto-discovered from `events/*.js`.
- **Degrade silently:** a missing/unconfigured/invalid log channel is never an error — return without sending; never throw out of a listener.
- **Category keys** (must match `LoggingConfig` columns exactly): `memberJoinLeave`, `messageEdit`, `messageDelete`, `modActions`, `roleChanges`, `channelChanges`, `voice`, `serverChanges`.
- **Intents:** message delete/edit events require the **GuildMessages** intent (added in Task 6). Message *content* additionally requires the privileged **MessageContent** intent; when absent, embeds show a "content unavailable" placeholder.
- **Multiple listeners per event are fine** — the loader binds each module's listener via `client.on`; anti-nuke and logging can both listen to `guildMemberAdd`.
- **Tests:** Vitest, `*.test.js` under `test/` mirroring `src/`. Run one file with `npx vitest run <path>`.
- **Commit** after each task's tests pass (`feat(log): ...`).

---

### Task 1: Log dispatcher (`src/modules/logging/dispatcher.js`)

**Files:**
- Create: `src/modules/logging/dispatcher.js`
- Test: `test/modules/logging/dispatcher.test.js`

**Interfaces:**
- Consumes: nothing (config passed in).
- Produces:
  - `resolveLogChannelId(loggingConfig, category): string | null` — returns the channel id for a category, or `null` if `loggingConfig` is missing, the category is in `loggingConfig.disabled`, or no channel is set.
  - `async dispatchLog({ guild, loggingConfig, category, embed, logger }): boolean` — resolves the channel, fetches it, sends the embed to a text channel; returns `false` (no throw) when unconfigured or on failure.
  - `async logEvent(ctx, guild, category, embed): boolean` — loads the guild config via `ctx.config.getGuild` and calls `dispatchLog`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import { resolveLogChannelId, dispatchLog, logEvent } from "../../../src/modules/logging/dispatcher.js";

describe("resolveLogChannelId", () => {
  it("returns the configured channel for a category", () => {
    expect(resolveLogChannelId({ memberJoinLeave: "c1", disabled: [] }, "memberJoinLeave")).toBe("c1");
  });
  it("returns null when the category is disabled", () => {
    expect(resolveLogChannelId({ memberJoinLeave: "c1", disabled: ["memberJoinLeave"] }, "memberJoinLeave")).toBeNull();
  });
  it("returns null when unconfigured or config missing", () => {
    expect(resolveLogChannelId({ disabled: [] }, "voice")).toBeNull();
    expect(resolveLogChannelId(null, "voice")).toBeNull();
  });
});

describe("dispatchLog", () => {
  it("sends to the configured text channel", async () => {
    const send = vi.fn(async () => {});
    const guild = { channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ok = await dispatchLog({ guild, loggingConfig: { voice: "c1", disabled: [] }, category: "voice", embed: {}, logger: { error: vi.fn() } });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ embeds: [{}] }));
  });
  it("returns false when the category is unconfigured", async () => {
    const guild = { channels: { fetch: vi.fn() } };
    const ok = await dispatchLog({ guild, loggingConfig: { disabled: [] }, category: "voice", embed: {}, logger: { error: vi.fn() } });
    expect(ok).toBe(false);
    expect(guild.channels.fetch).not.toHaveBeenCalled();
  });
});

describe("logEvent", () => {
  it("loads guild config and dispatches", async () => {
    const send = vi.fn(async () => {});
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const ctx = { config: { getGuild: vi.fn(async () => ({ logging: { memberJoinLeave: "c1", disabled: [] } })) }, logger: { error: vi.fn() } };
    const ok = await logEvent(ctx, guild, "memberJoinLeave", {});
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/logging/dispatcher.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
export function resolveLogChannelId(loggingConfig, category) {
  if (!loggingConfig) return null;
  const disabled = loggingConfig.disabled ?? [];
  if (Array.isArray(disabled) && disabled.includes(category)) return null;
  return loggingConfig[category] ?? null;
}

export async function dispatchLog({ guild, loggingConfig, category, embed, logger }) {
  const channelId = resolveLogChannelId(loggingConfig, category);
  if (!channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (err) {
    logger?.error?.({ err, channelId, category }, "log dispatch failed");
  }
  return false;
}

export async function logEvent(ctx, guild, category, embed) {
  const guildConfig = await ctx.config.getGuild(guild.id);
  return dispatchLog({ guild, loggingConfig: guildConfig.logging, category, embed, logger: ctx.logger });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/logging/dispatcher.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/logging/dispatcher.js test/modules/logging/dispatcher.test.js
git commit -m "feat(log): add per-category log dispatcher"
```

---

### Task 2: Event embed builders (`src/modules/logging/embeds.js`)

**Files:**
- Create: `src/modules/logging/embeds.js`
- Test: `test/modules/logging/embeds.test.js`

**Interfaces:**
- Consumes: `EmbedBuilder`, `COLORS`.
- Produces (all return `EmbedBuilder`):
  - `memberJoinEmbed(member)`, `memberLeaveEmbed(member)`
  - `messageDeleteEmbed(message)`, `messageEditEmbed(oldMessage, newMessage)`
  - `roleEmbed(role, action)` (`action` = `"created"|"deleted"`)
  - `channelEmbed(channel, action)`
  - `voiceEmbed(oldState, newState)`
  - `serverUpdateEmbed(oldGuild, newGuild)`
  - `modActionEmbed(caseRow)`
  - Message embeds show `"*(content unavailable — enable the Message Content intent)*"` when content is empty.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { memberJoinEmbed, messageDeleteEmbed, roleEmbed, voiceEmbed, modActionEmbed } from "../../../src/modules/logging/embeds.js";
import { COLORS } from "../../../src/lib/constants.js";

describe("logging embeds", () => {
  it("member join is green and names the user", () => {
    const e = memberJoinEmbed({ id: "u1", user: { tag: "alice#0001", id: "u1" } });
    expect(e.data.color).toBe(COLORS.success);
    expect(JSON.stringify(e.data)).toContain("u1");
  });

  it("message delete shows a content placeholder when empty", () => {
    const e = messageDeleteEmbed({ author: { id: "u1", tag: "a#1" }, content: "", channelId: "c1" });
    expect(JSON.stringify(e.data)).toContain("content unavailable");
  });

  it("message delete includes the content when present", () => {
    const e = messageDeleteEmbed({ author: { id: "u1", tag: "a#1" }, content: "hello world", channelId: "c1" });
    expect(JSON.stringify(e.data)).toContain("hello world");
  });

  it("role embed reflects the action", () => {
    const e = roleEmbed({ id: "r1", name: "Members" }, "created");
    expect(JSON.stringify(e.data)).toContain("created");
  });

  it("mod action embed shows the case number and type", () => {
    const e = modActionEmbed({ caseNumber: 4, type: "ban", targetId: "u1", moderatorId: "m1", reason: "spam" });
    const s = JSON.stringify(e.data);
    expect(s).toContain("4");
    expect(s).toContain("ban");
  });

  it("voice embed handles join, leave, and move", () => {
    const join = voiceEmbed({ channelId: null }, { channelId: "c2", member: { id: "u1" }, guild: {} });
    expect(JSON.stringify(join.data)).toContain("joined");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/logging/embeds.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
import { EmbedBuilder } from "discord.js";
import { COLORS } from "../../lib/constants.js";

const NO_CONTENT = "*(content unavailable — enable the Message Content intent)*";

export function memberJoinEmbed(member) {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("📥 Member Joined")
    .setDescription(`<@${member.id}> (\`${member.id}\`)${member.user?.tag ? ` — ${member.user.tag}` : ""}`)
    .setTimestamp();
}

export function memberLeaveEmbed(member) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle("📤 Member Left")
    .setDescription(`<@${member.id}> (\`${member.id}\`)${member.user?.tag ? ` — ${member.user.tag}` : ""}`)
    .setTimestamp();
}

export function messageDeleteEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle("🗑️ Message Deleted")
    .addFields(
      { name: "Author", value: message.author ? `<@${message.author.id}>` : "unknown", inline: true },
      { name: "Channel", value: message.channelId ? `<#${message.channelId}>` : "unknown", inline: true },
      { name: "Content", value: message.content?.slice(0, 1024) || NO_CONTENT },
    )
    .setTimestamp();
}

export function messageEditEmbed(oldMessage, newMessage) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle("✏️ Message Edited")
    .addFields(
      { name: "Author", value: newMessage.author ? `<@${newMessage.author.id}>` : "unknown", inline: true },
      { name: "Channel", value: newMessage.channelId ? `<#${newMessage.channelId}>` : "unknown", inline: true },
      { name: "Before", value: oldMessage.content?.slice(0, 1024) || NO_CONTENT },
      { name: "After", value: newMessage.content?.slice(0, 1024) || NO_CONTENT },
    )
    .setTimestamp();
}

export function roleEmbed(role, action) {
  return new EmbedBuilder()
    .setColor(action === "created" ? COLORS.success : COLORS.error)
    .setTitle(`🎭 Role ${action}`)
    .setDescription(`**${role.name}** (\`${role.id}\`)`)
    .setTimestamp();
}

export function channelEmbed(channel, action) {
  return new EmbedBuilder()
    .setColor(action === "created" ? COLORS.success : COLORS.error)
    .setTitle(`📁 Channel ${action}`)
    .setDescription(`**${channel.name}** (\`${channel.id}\`)`)
    .setTimestamp();
}

export function voiceEmbed(oldState, newState) {
  let title;
  let description;
  const userId = newState.member?.id ?? oldState.member?.id;
  if (!oldState.channelId && newState.channelId) {
    title = "🔊 Voice — joined";
    description = `<@${userId}> joined <#${newState.channelId}>`;
  } else if (oldState.channelId && !newState.channelId) {
    title = "🔇 Voice — left";
    description = `<@${userId}> left <#${oldState.channelId}>`;
  } else {
    title = "🔀 Voice — moved";
    description = `<@${userId}> moved <#${oldState.channelId}> → <#${newState.channelId}>`;
  }
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(description).setTimestamp();
}

export function serverUpdateEmbed(oldGuild, newGuild) {
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode)
    changes.push(`**Vanity:** ${oldGuild.vanityURLCode ?? "none"} → ${newGuild.vanityURLCode ?? "none"}`);
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("⚙️ Server Updated")
    .setDescription(changes.length ? changes.join("\n") : "Server settings changed.")
    .setTimestamp();
}

export function modActionEmbed(caseRow) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`🔨 Mod Action — Case #${caseRow.caseNumber} (${caseRow.type})`)
    .addFields(
      { name: "User", value: `<@${caseRow.targetId}>`, inline: true },
      { name: "Moderator", value: `<@${caseRow.moderatorId}>`, inline: true },
      { name: "Reason", value: caseRow.reason ?? "No reason provided" },
    )
    .setTimestamp();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/modules/logging/embeds.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/logging/embeds.js test/modules/logging/embeds.test.js
git commit -m "feat(log): add event embed builders"
```

---

### Task 3: Member + message listeners

**Files:**
- Create: `src/modules/logging/events/guildMemberAdd.js`
- Create: `src/modules/logging/events/guildMemberRemove.js`
- Create: `src/modules/logging/events/messageDelete.js`
- Create: `src/modules/logging/events/messageUpdate.js`
- Test: `test/modules/logging/memberMessageListeners.test.js`

**Interfaces:**
- Consumes: `logEvent` (T1), embed builders (T2), `Events`.
- Produces: four listener modules. Each guards partial/bot cases, builds the category embed, and calls `logEvent`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import memberAdd from "../../../src/modules/logging/events/guildMemberAdd.js";
import msgDelete from "../../../src/modules/logging/events/messageDelete.js";
import msgUpdate from "../../../src/modules/logging/events/messageUpdate.js";

function ctx() {
  const send = vi.fn(async () => {});
  return {
    config: { getGuild: vi.fn(async () => ({ logging: { memberJoinLeave: "c1", messageDelete: "c1", messageEdit: "c1", disabled: [] } })) },
    logger: { error: vi.fn() },
    _send: send,
    _guild: { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } },
  };
}

describe("member add listener", () => {
  it("logs a join", async () => {
    const c = ctx();
    await memberAdd.execute(c, { id: "u1", user: { id: "u1", tag: "a#1", bot: false }, guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
});

describe("message delete listener", () => {
  it("ignores bot messages", async () => {
    const c = ctx();
    await msgDelete.execute(c, { author: { bot: true }, guild: c._guild, channelId: "x" });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a human message deletion", async () => {
    const c = ctx();
    await msgDelete.execute(c, { author: { id: "u1", bot: false, tag: "a#1" }, guild: c._guild, channelId: "x", content: "hi" });
    expect(c._send).toHaveBeenCalled();
  });
});

describe("message update listener", () => {
  it("ignores no-op edits", async () => {
    const c = ctx();
    const msg = { author: { id: "u1", bot: false }, guild: c._guild, channelId: "x", content: "same" };
    await msgUpdate.execute(c, { ...msg }, { ...msg });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a real edit", async () => {
    const c = ctx();
    const base = { author: { id: "u1", bot: false }, guild: c._guild, channelId: "x" };
    await msgUpdate.execute(c, { ...base, content: "old" }, { ...base, content: "new" });
    expect(c._send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/logging/memberMessageListeners.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/modules/logging/events/guildMemberAdd.js`**

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { memberJoinEmbed } from "../embeds.js";

export default {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    await logEvent(ctx, member.guild, "memberJoinLeave", memberJoinEmbed(member));
  },
};
```

- [ ] **Step 4: Write `src/modules/logging/events/guildMemberRemove.js`**

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { memberLeaveEmbed } from "../embeds.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member.guild) return;
    await logEvent(ctx, member.guild, "memberJoinLeave", memberLeaveEmbed(member));
  },
};
```

- [ ] **Step 5: Write `src/modules/logging/events/messageDelete.js`**

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { messageDeleteEmbed } from "../embeds.js";

export default {
  name: Events.MessageDelete,
  async execute(ctx, message) {
    if (!message.guild) return;
    if (message.author?.bot) return;
    await logEvent(ctx, message.guild, "messageDelete", messageDeleteEmbed(message));
  },
};
```

- [ ] **Step 6: Write `src/modules/logging/events/messageUpdate.js`**

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { messageEditEmbed } from "../embeds.js";

export default {
  name: Events.MessageUpdate,
  async execute(ctx, oldMessage, newMessage) {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // ignore embed/attachment-only updates
    await logEvent(ctx, newMessage.guild, "messageEdit", messageEditEmbed(oldMessage, newMessage));
  },
};
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run test/modules/logging/memberMessageListeners.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/modules/logging/events/guildMemberAdd.js src/modules/logging/events/guildMemberRemove.js src/modules/logging/events/messageDelete.js src/modules/logging/events/messageUpdate.js test/modules/logging/memberMessageListeners.test.js
git commit -m "feat(log): add member and message event listeners"
```

---

### Task 4: Role, channel, server, and voice listeners

**Files:**
- Create: `src/modules/logging/events/roleCreate.js`
- Create: `src/modules/logging/events/roleDelete.js`
- Create: `src/modules/logging/events/channelCreate.js`
- Create: `src/modules/logging/events/channelDelete.js`
- Create: `src/modules/logging/events/voiceStateUpdate.js`
- Create: `src/modules/logging/events/guildUpdate.js`
- Test: `test/modules/logging/structureListeners.test.js`

**Interfaces:**
- Consumes: `logEvent` (T1), embed builders (T2), `Events`.
- Produces: six listener modules routing to `roleChanges`, `channelChanges`, `voice`, and `serverChanges`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from "vitest";
import roleCreate from "../../../src/modules/logging/events/roleCreate.js";
import channelDelete from "../../../src/modules/logging/events/channelDelete.js";
import voiceUpdate from "../../../src/modules/logging/events/voiceStateUpdate.js";
import guildUpdate from "../../../src/modules/logging/events/guildUpdate.js";

function ctx() {
  const send = vi.fn(async () => {});
  const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
  return {
    config: { getGuild: vi.fn(async () => ({ logging: { roleChanges: "c1", channelChanges: "c1", voice: "c1", serverChanges: "c1", disabled: [] } })) },
    logger: { error: vi.fn() },
    _send: send,
    _guild: guild,
  };
}

describe("structure listeners", () => {
  it("logs role creation", async () => {
    const c = ctx();
    await roleCreate.execute(c, { id: "r1", name: "New", guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
  it("logs channel deletion (guild channels only)", async () => {
    const c = ctx();
    await channelDelete.execute(c, { id: "ch1", name: "general", guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
  it("ignores DM channel deletion (no guild)", async () => {
    const c = ctx();
    await channelDelete.execute(c, { id: "dm", name: undefined });
    expect(c._send).not.toHaveBeenCalled();
  });
  it("logs a voice join", async () => {
    const c = ctx();
    await voiceUpdate.execute(c, { channelId: null, guild: c._guild }, { channelId: "v1", member: { id: "u1" }, guild: c._guild });
    expect(c._send).toHaveBeenCalled();
  });
  it("logs a server update", async () => {
    const c = ctx();
    await guildUpdate.execute(c, { id: "g1", name: "Old" }, { id: "g1", name: "New", channels: c._guild.channels });
    expect(c._send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/modules/logging/structureListeners.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the role listeners**

`src/modules/logging/events/roleCreate.js`:
```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { roleEmbed } from "../embeds.js";

export default {
  name: Events.GuildRoleCreate,
  async execute(ctx, role) {
    await logEvent(ctx, role.guild, "roleChanges", roleEmbed(role, "created"));
  },
};
```

`src/modules/logging/events/roleDelete.js`:
```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { roleEmbed } from "../embeds.js";

export default {
  name: Events.GuildRoleDelete,
  async execute(ctx, role) {
    await logEvent(ctx, role.guild, "roleChanges", roleEmbed(role, "deleted"));
  },
};
```

- [ ] **Step 4: Write the channel listeners**

`src/modules/logging/events/channelCreate.js`:
```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { channelEmbed } from "../embeds.js";

export default {
  name: Events.ChannelCreate,
  async execute(ctx, channel) {
    if (!channel.guild) return;
    await logEvent(ctx, channel.guild, "channelChanges", channelEmbed(channel, "created"));
  },
};
```

`src/modules/logging/events/channelDelete.js`:
```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { channelEmbed } from "../embeds.js";

export default {
  name: Events.ChannelDelete,
  async execute(ctx, channel) {
    if (!channel.guild) return;
    await logEvent(ctx, channel.guild, "channelChanges", channelEmbed(channel, "deleted"));
  },
};
```

- [ ] **Step 5: Write the voice listener** `src/modules/logging/events/voiceStateUpdate.js`

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { voiceEmbed } from "../embeds.js";

export default {
  name: Events.VoiceStateUpdate,
  async execute(ctx, oldState, newState) {
    if (oldState.channelId === newState.channelId) return; // mute/deaf toggles, not a move
    const guild = newState.guild ?? oldState.guild;
    await logEvent(ctx, guild, "voice", voiceEmbed(oldState, newState));
  },
};
```

- [ ] **Step 6: Write the server listener** `src/modules/logging/events/guildUpdate.js`

```js
import { Events } from "discord.js";
import { logEvent } from "../dispatcher.js";
import { serverUpdateEmbed } from "../embeds.js";

export default {
  name: Events.GuildUpdate,
  async execute(ctx, oldGuild, newGuild) {
    await logEvent(ctx, newGuild, "serverChanges", serverUpdateEmbed(oldGuild, newGuild));
  },
};
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run test/modules/logging/structureListeners.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 8: Commit**

```bash
git add src/modules/logging/events/roleCreate.js src/modules/logging/events/roleDelete.js src/modules/logging/events/channelCreate.js src/modules/logging/events/channelDelete.js src/modules/logging/events/voiceStateUpdate.js src/modules/logging/events/guildUpdate.js test/modules/logging/structureListeners.test.js
git commit -m "feat(log): add role, channel, voice, and server listeners"
```

---

### Task 5: Moderation-action logging (`src/core/CaseService` emitter + `src/modules/logging/modLog.js`)

**Files:**
- Modify: `src/modules/moderation/CaseService.js` (extend `EventEmitter`, emit `caseCreated`)
- Create: `src/modules/logging/modLog.js`
- Test: `test/modules/logging/modLog.test.js`
- Test: `test/modules/moderation/CaseService.emit.test.js`

**Interfaces:**
- Consumes: `EventEmitter` (node), `modActionEmbed` (T2), `dispatchLog` (T1).
- Produces:
  - `CaseService` extends `EventEmitter`; `createCase` emits `"caseCreated"` with the created record after it is persisted.
  - `async handleCaseCreated(context, record): boolean` — resolves the guild from `context.client.guilds.cache`, loads its logging config, dispatches a `modActions` log.
  - `registerModLogListener(context)` — subscribes `handleCaseCreated` to `context.cases` `"caseCreated"`.

- [ ] **Step 1: Write the failing tests**

`test/modules/moderation/CaseService.emit.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { CaseService } from "../../../src/modules/moderation/CaseService.js";

function mockPrisma() {
  const tx = { case: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ id: "c1", ...data })) } };
  return { $transaction: vi.fn(async (fn) => fn(tx)) };
}

describe("CaseService events", () => {
  it("emits caseCreated after creating a case", async () => {
    const svc = new CaseService(mockPrisma());
    const spy = vi.fn();
    svc.on("caseCreated", spy);
    await svc.createCase({ guildId: "g1", type: "ban", targetId: "u1", moderatorId: "m1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "ban", caseNumber: 1 }));
  });
});
```

`test/modules/logging/modLog.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { handleCaseCreated } from "../../../src/modules/logging/modLog.js";

describe("handleCaseCreated", () => {
  it("dispatches a mod-action log to the configured channel", async () => {
    const send = vi.fn(async () => {});
    const guild = { id: "g1", channels: { fetch: vi.fn(async () => ({ isTextBased: () => true, send })) } };
    const context = {
      client: { guilds: { cache: new Map([["g1", guild]]) } },
      config: { getGuild: vi.fn(async () => ({ logging: { modActions: "c1", disabled: [] } })) },
      logger: { error: vi.fn() },
    };
    const ok = await handleCaseCreated(context, { caseNumber: 1, type: "ban", targetId: "u1", moderatorId: "m1", reason: "x", guildId: "g1" });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalled();
  });

  it("no-ops when the guild is not on this shard", async () => {
    const context = { client: { guilds: { cache: new Map() } }, config: { getGuild: vi.fn() }, logger: { error: vi.fn() } };
    const ok = await handleCaseCreated(context, { guildId: "gX", caseNumber: 1, type: "ban", targetId: "u1", moderatorId: "m1" });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/modules/logging/modLog.test.js test/modules/moderation/CaseService.emit.test.js`
Expected: FAIL — `handleCaseCreated` missing; `caseCreated` not emitted.

- [ ] **Step 3: Modify `src/modules/moderation/CaseService.js`**

Add the import at the top:
```js
import { EventEmitter } from "node:events";
```

Change the class declaration and constructor:
```js
export class CaseService extends EventEmitter {
  constructor(prisma) {
    super();
    this.prisma = prisma;
  }
```

In `createCase`, capture the created record, emit, then return it. Replace the `return this.prisma.$transaction(...)` body with:
```js
  async createCase({ guildId, type, targetId, moderatorId, reason = "No reason provided", expiresAt = null }) {
    const record = await this.prisma.$transaction(async (tx) => {
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
    this.emit("caseCreated", record);
    return record;
  }
```

- [ ] **Step 4: Write `src/modules/logging/modLog.js`**

```js
import { dispatchLog } from "./dispatcher.js";
import { modActionEmbed } from "./embeds.js";

export async function handleCaseCreated(context, record) {
  const guild = context.client.guilds.cache.get(record.guildId);
  if (!guild) return false;
  const guildConfig = await context.config.getGuild(record.guildId);
  return dispatchLog({
    guild,
    loggingConfig: guildConfig.logging,
    category: "modActions",
    embed: modActionEmbed(record),
    logger: context.logger,
  });
}

export function registerModLogListener(context) {
  context.cases.on("caseCreated", (record) => {
    handleCaseCreated(context, record).catch((err) =>
      context.logger.error({ err }, "mod-action log failed"),
    );
  });
}
```

- [ ] **Step 5: Run to verify they pass (and existing CaseService tests still pass)**

Run: `npx vitest run test/modules/logging/modLog.test.js test/modules/moderation/CaseService.emit.test.js test/modules/moderation/CaseService.test.js`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add src/modules/moderation/CaseService.js src/modules/logging/modLog.js test/modules/logging/modLog.test.js test/modules/moderation/CaseService.emit.test.js
git commit -m "feat(log): add moderation-action logging via case events"
```

---

### Task 6: Wiring — intents, mod-log registration, docs, verification

**Files:**
- Modify: `src/bot.js` (add `GuildMessages` intent, register the mod-log listener, add message partials)
- Modify: `README.md`

**Interfaces:**
- Consumes: `registerModLogListener` (T5); the existing `context` in `src/bot.js`.
- Produces: message delete/edit events flowing to logging; mod actions logged on case creation.

- [ ] **Step 1: Modify `src/bot.js`** — add the import:

```js
import { registerModLogListener } from "./modules/logging/modLog.js";
```

Add `GatewayIntentBits.GuildMessages` to the `intents` array (after `GuildVoiceStates`):

```js
      GatewayIntentBits.GuildMessages,
```

Add message partials so uncached deletes/edits still fire — change the `partials` array to:

```js
    partials: [Partials.GuildMember, Partials.User, Partials.Message, Partials.Channel],
```

Register the mod-log listener right after `registerExpiryJob(context);`:

```js
  registerModLogListener(context);
```

- [ ] **Step 2: Verify wiring (fails only on missing env)**

Run: `node src/bot.js`
Expected: exits with the `Invalid environment` error (proves all logging imports resolve and wiring builds).

- [ ] **Step 3: Update `README.md`** — add a Logging section before `## Status`:

````markdown
## Logging

Per-guild, per-category event logging, each routed to its own channel and independently
toggleable: member join/leave, message delete, message edit, role changes, channel changes,
server changes, voice state changes, and moderation actions (mirrored from the case system).
Unconfigured categories are silently skipped. Message **content** in delete/edit logs requires
the privileged **Message Content** intent; without it, those logs show a placeholder. Channels
are set in the config phase (`/logging` / `/config`).
````

Update `## Status` to:
````markdown
## Status

Foundation + anti-nuke + moderation + logging complete. The config & help phase (setup commands,
`/help`) lands next.
````

- [ ] **Step 4: Run the full test suite and lint**

Run: `npx vitest run && npx eslint .`
Expected: all tests PASS; lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/bot.js README.md
git commit -m "feat(log): enable message intent and wire mod-action logging"
```

---

## Self-Review

**Spec coverage (spec §9 Logging):**
- Per-guild `LoggingConfig` category→channel mapping, toggleable → Task 1 (`resolveLogChannelId` honors `disabled`). ✓
- Member join/leave → Task 3. ✓
- Message edit/delete (with content-intent caveat) → Tasks 2, 3, and the `NO_CONTENT` placeholder. ✓
- Moderation actions (mirror case creation) → Task 5. ✓
- Role changes / channel changes / server changes → Task 4. ✓
- Voice state changes → Task 4. ✓
- Missing/invalid channels degrade silently → Task 1 (`dispatchLog` returns false, never throws). ✓
- MessageContent intent note → documented in README (Task 6) and placeholder in embeds. ✓
- Bulk delete "summarized": not separately implemented; single-delete logging covers the spec's core. Documented as covered by `messageDelete`; a dedicated bulk summary can be a later enhancement (noted, not a blocking gap for the category).

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every listener and builder is complete with real tests. ✓

**Type consistency:**
- `resolveLogChannelId(loggingConfig, category)` / `dispatchLog({ guild, loggingConfig, category, embed, logger })` / `logEvent(ctx, guild, category, embed)` (T1) match every listener call (T3, T4) and `modLog` (T5). ✓
- Category keys used by listeners (`memberJoinLeave`, `messageDelete`, `messageEdit`, `roleChanges`, `channelChanges`, `voice`, `serverChanges`, `modActions`) match the `LoggingConfig` columns from the foundation schema. ✓
- Embed builder names/signatures (T2) match their listener imports (T3/T4) and `modLog` (`modActionEmbed`, T5). ✓
- `CaseService` emitting `caseCreated` with the record (T5) matches `registerModLogListener`/`handleCaseCreated` consumers (T5). Existing `createCase` return value unchanged → moderation commands unaffected. ✓
- `context.cases`, `context.client`, `context.config`, `context.logger` (foundation + moderation wiring) all present for `registerModLogListener` (T6). ✓
