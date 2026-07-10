export class Cooldowns {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.map = new Map(); // key -> expiresAt (ms)
  }

  check(commandName, userId, seconds) {
    const key = `${commandName}:${userId}`;
    const nowMs = this.now();
    const expiresAt = this.map.get(key);
    if (expiresAt && expiresAt > nowMs) {
      return { limited: true, retryAfterMs: expiresAt - nowMs };
    }
    this.map.set(key, nowMs + seconds * 1000);
    return { limited: false };
  }
}
