import { WindowTracker } from "./WindowTracker.js";

export class AntinukeState {
  constructor(now = () => Date.now()) {
    this.actions = new WindowTracker(now);
    this.joins = new WindowTracker(now);
  }

  recordAction(guildId, actionKey, executorId, windowMs) {
    return this.actions.record(`${guildId}:${actionKey}:${executorId}`, windowMs);
  }

  recordJoin(guildId, windowMs) {
    return this.joins.record(guildId, windowMs);
  }
}
