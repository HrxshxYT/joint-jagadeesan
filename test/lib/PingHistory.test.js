import { describe, it, expect } from "vitest";
import { PingHistory } from "../../src/lib/PingHistory.js";

describe("PingHistory", () => {
  it("keeps samples in insertion order", () => {
    const h = new PingHistory(5);
    h.push(10); h.push(20); h.push(30);
    expect(h.samples()).toEqual([10, 20, 30]);
  });
  it("caps at the configured capacity, dropping oldest", () => {
    const h = new PingHistory(3);
    [1, 2, 3, 4, 5].forEach((n) => h.push(n));
    expect(h.samples()).toEqual([3, 4, 5]);
  });
  it("ignores negative pings (ws.ping is -1 before the first heartbeat)", () => {
    const h = new PingHistory(5);
    h.push(-1); h.push(42);
    expect(h.samples()).toEqual([42]);
  });
  it("samples() returns a copy, not the internal array", () => {
    const h = new PingHistory(5);
    h.push(1);
    h.samples().push(999);
    expect(h.samples()).toEqual([1]);
  });
});
