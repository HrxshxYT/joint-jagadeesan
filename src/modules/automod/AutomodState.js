import { WindowTracker } from "../antinuke/WindowTracker.js";

export class AutomodState {
  constructor(now = () => Date.now()) {
    this.messages = new WindowTracker(now);
  }

  recordMessage(guildId, userId, windowMs) {
    return this.messages.record(`${guildId}:${userId}`, windowMs);
  }
}
