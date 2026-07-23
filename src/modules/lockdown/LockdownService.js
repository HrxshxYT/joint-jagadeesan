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
