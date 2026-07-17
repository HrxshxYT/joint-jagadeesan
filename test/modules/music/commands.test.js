import { describe, it, expect, vi } from "vitest";
import play from "../../../src/modules/music/commands/play.js";
import pause from "../../../src/modules/music/commands/pause.js";
import resume from "../../../src/modules/music/commands/resume.js";
import skip from "../../../src/modules/music/commands/skip.js";
import stop from "../../../src/modules/music/commands/stop.js";
import volume from "../../../src/modules/music/commands/volume.js";
import loop from "../../../src/modules/music/commands/loop.js";
import shuffle from "../../../src/modules/music/commands/shuffle.js";
import remove from "../../../src/modules/music/commands/remove.js";
import clear from "../../../src/modules/music/commands/clear.js";
import seek from "../../../src/modules/music/commands/seek.js";
import autoplay from "../../../src/modules/music/commands/autoplay.js";
import filter from "../../../src/modules/music/commands/filter.js";
import nowplaying from "../../../src/modules/music/commands/nowplaying.js";
import queueCmd from "../../../src/modules/music/commands/queue.js";

const track = (title = "Song") => ({ info: { title, duration: 200000, isStream: false, author: "a" }, requester: { id: "u1" } });

function fakePlayer(overrides = {}) {
  const data = new Map();
  return {
    voiceChannelId: "vc1",
    connected: true,
    playing: true,
    paused: false,
    repeatMode: "off",
    volume: 100,
    position: 1000,
    filterManager: { resetFilters: vi.fn(async () => {}), setEQ: vi.fn(async () => {}), toggleNightcore: vi.fn(async () => {}), toggleRotation: vi.fn(async () => {}) },
    queue: {
      current: track("Current"),
      tracks: [track("A"), track("B")],
      add: vi.fn(async () => {}),
      shuffle: vi.fn(async () => {}),
      splice: vi.fn(async () => {}),
    },
    get: (k) => data.get(k),
    set: (k, v) => data.set(k, v),
    connect: vi.fn(async () => {}),
    search: vi.fn(async () => ({ loadType: "search", tracks: [track("Found")] })),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    skip: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    setRepeatMode: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    ...overrides,
  };
}

function ctxWith(player, { enabled = true } = {}) {
  return {
    music: {
      isEnabled: enabled,
      getPlayer: () => player,
      createPlayer: vi.fn(() => player),
    },
  };
}

function interaction(opts = {}) {
  return {
    guildId: "g1",
    channelId: "text1",
    user: { id: "u1" },
    member: { voice: { channelId: "channelId" in opts ? opts.channelId : "vc1" } },
    options: {
      getString: (n) => opts[n],
      getInteger: (n) => opts[n],
    },
    reply: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
  };
}

describe("disabled service", () => {
  it("play tells the user music isn't configured", async () => {
    const i = interaction({ query: "x" });
    await play.execute(i, ctxWith(undefined, { enabled: false }));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(i.deferReply).not.toHaveBeenCalled();
  });
  it("pause is guarded by the shared kit", async () => {
    const i = interaction();
    await pause.execute(i, ctxWith(undefined, { enabled: false }));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe("play", () => {
  it("requires the user to be in a voice channel", async () => {
    const i = interaction({ query: "x", channelId: null });
    await play.execute(i, ctxWith(fakePlayer()));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it("searches, enqueues, and plays", async () => {
    const player = fakePlayer({ playing: false, paused: false });
    const i = interaction({ query: "never gonna" });
    await play.execute(i, ctxWith(player));
    expect(i.deferReply).toHaveBeenCalled();
    expect(player.search).toHaveBeenCalled();
    expect(player.queue.add).toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });

  it("reports when there are no results", async () => {
    const player = fakePlayer({ search: vi.fn(async () => ({ loadType: "empty", tracks: [] })) });
    const i = interaction({ query: "zzz" });
    await play.execute(i, ctxWith(player));
    expect(player.queue.add).not.toHaveBeenCalled();
    expect(i.editReply).toHaveBeenCalled();
  });

  it("does not start playback when something is already playing", async () => {
    const player = fakePlayer({ playing: true });
    await play.execute(interaction({ query: "x" }), ctxWith(player));
    expect(player.play).not.toHaveBeenCalled();
  });
});

describe("control commands call the right player methods", () => {
  it("pause", async () => {
    const p = fakePlayer({ paused: false });
    await pause.execute(interaction(), ctxWith(p));
    expect(p.pause).toHaveBeenCalled();
  });
  it("resume", async () => {
    const p = fakePlayer();
    await resume.execute(interaction(), ctxWith(p));
    expect(p.resume).toHaveBeenCalled();
  });
  it("skip", async () => {
    const p = fakePlayer();
    await skip.execute(interaction(), ctxWith(p));
    expect(p.skip).toHaveBeenCalledWith(0, false);
  });
  it("stop", async () => {
    const p = fakePlayer();
    await stop.execute(interaction(), ctxWith(p));
    expect(p.destroy).toHaveBeenCalled();
  });
  it("shuffle", async () => {
    const p = fakePlayer();
    await shuffle.execute(interaction(), ctxWith(p));
    expect(p.queue.shuffle).toHaveBeenCalled();
  });
  it("loop passes the chosen mode", async () => {
    const p = fakePlayer();
    await loop.execute(interaction({ mode: "queue" }), ctxWith(p));
    expect(p.setRepeatMode).toHaveBeenCalledWith("queue");
  });
  it("volume clamps and sets", async () => {
    const p = fakePlayer();
    await volume.execute(interaction({ level: 500 }), ctxWith(p));
    expect(p.setVolume).toHaveBeenCalledWith(200);
  });
  it("seek converts seconds to ms", async () => {
    const p = fakePlayer();
    await seek.execute(interaction({ seconds: 30 }), ctxWith(p));
    expect(p.seek).toHaveBeenCalledWith(30000);
  });
  it("seek rejects positions past the end", async () => {
    const p = fakePlayer();
    const i = interaction({ seconds: 9999 });
    await seek.execute(i, ctxWith(p));
    expect(p.seek).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
  it("remove splices the chosen position", async () => {
    const p = fakePlayer();
    await remove.execute(interaction({ position: 1 }), ctxWith(p));
    expect(p.queue.splice).toHaveBeenCalledWith(0, 1);
  });
  it("remove rejects an out-of-range position", async () => {
    const p = fakePlayer();
    const i = interaction({ position: 99 });
    await remove.execute(i, ctxWith(p));
    expect(p.queue.splice).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
  it("clear empties the upcoming queue", async () => {
    const p = fakePlayer();
    await clear.execute(interaction(), ctxWith(p));
    expect(p.queue.splice).toHaveBeenCalledWith(0, 2);
  });
  it("autoplay toggles the flag", async () => {
    const p = fakePlayer();
    await autoplay.execute(interaction(), ctxWith(p));
    expect(p.get("autoplay")).toBe(true);
  });
  it("filter applies nightcore and records it", async () => {
    const p = fakePlayer();
    await filter.execute(interaction({ name: "nightcore" }), ctxWith(p));
    expect(p.filterManager.toggleNightcore).toHaveBeenCalled();
    expect(p.get("filter")).toBe("nightcore");
  });
});

describe("view commands", () => {
  it("nowplaying replies with the now-playing embed", async () => {
    const p = fakePlayer();
    const i = interaction();
    await nowplaying.execute(i, ctxWith(p));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ components: expect.any(Array) }));
  });
  it("queue replies with the queue embed", async () => {
    const p = fakePlayer();
    const i = interaction({ page: 1 });
    await queueCmd.execute(i, ctxWith(p));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });
  it("nowplaying rejects when nothing is playing", async () => {
    const p = fakePlayer({ queue: { current: null, tracks: [] } });
    const i = interaction();
    await nowplaying.execute(i, ctxWith(p));
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
