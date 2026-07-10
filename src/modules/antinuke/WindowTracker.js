export class WindowTracker {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.events = new Map(); // key -> number[] (timestamps)
  }

  record(key, windowMs) {
    const nowMs = this.now();
    const cutoff = nowMs - windowMs;
    const kept = (this.events.get(key) ?? []).filter((t) => t > cutoff);
    kept.push(nowMs);
    this.events.set(key, kept);
    return kept.length;
  }

  reset(key) {
    this.events.delete(key);
  }
}
