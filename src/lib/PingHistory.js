// In-memory ring buffer of recent gateway latency samples (per shard).
export class PingHistory {
  constructor(cap = 30) {
    this.cap = cap;
    this.buf = [];
  }

  push(ping) {
    if (typeof ping !== "number" || ping < 0) return;
    this.buf.push(ping);
    if (this.buf.length > this.cap) this.buf.shift();
  }

  samples() {
    return [...this.buf];
  }
}
