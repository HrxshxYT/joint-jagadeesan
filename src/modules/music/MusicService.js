import { LavalinkManager } from "lavalink-client";
import { onTrackStart, onQueueEnd, onTrackError } from "./lifecycle.js";

const IDLE_LEAVE_MS = 5 * 60 * 1000;

// Wraps lavalink-client's LavalinkManager. Stays a safe no-op when no node is
// configured, so the bot runs fine without music. The manager is injectable
// (`createManager`) so the wiring is testable without a live Lavalink node.
export class MusicService {
  constructor({ client, logger, config, createManager = (opts) => new LavalinkManager(opts) }) {
    this.client = client;
    this.logger = logger;
    this.isEnabled = Boolean(config);
    this.manager = null;
    this._leaveTimers = new Map();

    if (!this.isEnabled) return;

    this._sendToShard = (guildId, payload) =>
      client.guilds?.cache?.get(guildId)?.shard?.send(payload);

    this.manager = createManager({
      nodes: [
        {
          id: "main",
          host: config.host,
          port: config.port,
          authorization: config.password,
          secure: config.secure,
        },
      ],
      sendToShard: this._sendToShard,
      client: { id: "", username: "Suzune" },
      playerOptions: {
        defaultSearchPlatform: "ytsearch",
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        clientBasedPositionUpdateInterval: 100,
      },
    });

    this._registerEvents();
  }

  _registerEvents() {
    const deps = {
      fetchChannel: (id) => this.client.channels.fetch(id).catch(() => null),
      logger: this.logger,
      autoplay: (player) => this._autoplay(player),
      scheduleLeave: (player) => this._scheduleLeave(player),
    };
    this.manager.on("trackStart", (player, track) => onTrackStart(player, track, deps));
    this.manager.on("queueEnd", (player) => onQueueEnd(player, deps));
    this.manager.on("trackError", (player, track) => onTrackError(player, track, deps));
    this.manager.on("trackStuck", (player, track) => onTrackError(player, track, deps));
    this.manager.nodeManager?.on("error", (node, err) =>
      this.logger?.error?.({ err, node: node?.id }, "lavalink node error"));
    this.manager.nodeManager?.on("connect", (node) =>
      this.logger?.info?.({ node: node?.id }, "lavalink node connected"));
  }

  // Ask Lavalink for a track related to the last one and queue it (best-effort).
  async _autoplay(player) {
    try {
      const seed = player.queue.previous?.[0] ?? player.queue.current;
      if (!seed) return this._scheduleLeave(player);
      const res = await player.search({ query: seed.info.uri ?? seed.info.title }, seed.requester);
      const next = res?.tracks?.find((t) => t.info.identifier !== seed.info.identifier);
      if (next) {
        await player.queue.add(next);
        await player.play();
      } else {
        this._scheduleLeave(player);
      }
    } catch (err) {
      this.logger?.warn?.({ err }, "autoplay failed");
      this._scheduleLeave(player);
    }
  }

  _scheduleLeave(player) {
    const existing = this._leaveTimers.get(player.guildId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.getPlayer(player.guildId)?.destroy().catch(() => {});
      this._leaveTimers.delete(player.guildId);
    }, IDLE_LEAVE_MS);
    timer.unref?.();
    this._leaveTimers.set(player.guildId, timer);
  }

  getPlayer(guildId) {
    return this.manager?.getPlayer(guildId);
  }

  createPlayer(options) {
    return this.manager?.createPlayer(options);
  }

  async init(clientUser) {
    if (!this.manager) return;
    await this.manager.init({ id: clientUser.id, username: clientUser.username });
  }

  sendRawData(packet) {
    this.manager?.sendRawData(packet);
  }
}
