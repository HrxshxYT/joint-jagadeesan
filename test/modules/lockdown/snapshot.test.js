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
