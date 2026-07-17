import { describe, it, expect, vi } from "vitest";
import { MusicService } from "../../../src/modules/music/MusicService.js";

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

function fakeManager() {
  return {
    on: vi.fn(),
    nodeManager: { on: vi.fn() },
    getPlayer: vi.fn(() => ({ guildId: "g1" })),
    createPlayer: vi.fn((o) => ({ ...o })),
    init: vi.fn(async () => {}),
    sendRawData: vi.fn(),
  };
}

const config = { host: "node.example.com", port: 2333, password: "secret", secure: true };

describe("MusicService (disabled)", () => {
  const svc = new MusicService({ client: {}, logger, config: null });

  it("is disabled with no manager when no config is given", () => {
    expect(svc.isEnabled).toBe(false);
    expect(svc.manager).toBe(null);
  });

  it("has safe no-op accessors when disabled", async () => {
    expect(svc.getPlayer("g1")).toBeUndefined();
    expect(svc.createPlayer({ guildId: "g1" })).toBeUndefined();
    expect(() => svc.sendRawData({})).not.toThrow();
    await expect(svc.init({ id: "1", username: "Suzune" })).resolves.toBeUndefined();
  });
});

describe("MusicService (enabled)", () => {
  it("builds a manager from the node config and registers events", () => {
    const manager = fakeManager();
    const createManager = vi.fn(() => manager);
    const svc = new MusicService({ client: {}, logger, config, createManager });

    expect(svc.isEnabled).toBe(true);
    const opts = createManager.mock.calls[0][0];
    expect(opts.nodes[0]).toMatchObject({
      host: "node.example.com",
      port: 2333,
      authorization: "secret",
      secure: true,
    });
    expect(typeof opts.sendToShard).toBe("function");

    const events = manager.on.mock.calls.map((c) => c[0]);
    expect(events).toEqual(expect.arrayContaining(["trackStart", "queueEnd", "trackError", "trackStuck"]));
  });

  it("routes voice packets to the correct shard", () => {
    const send = vi.fn();
    const client = { guilds: { cache: { get: () => ({ shard: { send } }) } } };
    const svc = new MusicService({ client, logger, config, createManager: () => fakeManager() });
    svc._sendToShard("g1", { op: 4 });
    expect(send).toHaveBeenCalledWith({ op: 4 });
  });

  it("delegates player lookups and init to the manager", async () => {
    const manager = fakeManager();
    const svc = new MusicService({ client: {}, logger, config, createManager: () => manager });
    expect(svc.getPlayer("g1")).toEqual({ guildId: "g1" });
    svc.createPlayer({ guildId: "g1", voiceChannelId: "v" });
    expect(manager.createPlayer).toHaveBeenCalled();
    await svc.init({ id: "42", username: "Suzune" });
    expect(manager.init).toHaveBeenCalledWith({ id: "42", username: "Suzune" });
    svc.sendRawData({ t: "VOICE_UPDATE" });
    expect(manager.sendRawData).toHaveBeenCalled();
  });
});
