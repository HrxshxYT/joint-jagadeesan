import { describe, it, expect } from "vitest";
import { WindowTracker } from "../../../src/modules/antinuke/WindowTracker.js";

describe("WindowTracker", () => {
  it("counts events within the window", () => {
    let t = 1000;
    const wt = new WindowTracker(() => t);
    expect(wt.record("k", 10_000)).toBe(1);
    t = 3000;
    expect(wt.record("k", 10_000)).toBe(2);
    t = 6000;
    expect(wt.record("k", 10_000)).toBe(3);
  });

  it("drops events older than the window", () => {
    let t = 1000;
    const wt = new WindowTracker(() => t);
    wt.record("k", 5_000); // at 1000
    t = 7000; // 6s later, first event (1000) is now outside a 5s window
    expect(wt.record("k", 5_000)).toBe(1);
  });

  it("keeps separate counts per key and supports reset", () => {
    const wt = new WindowTracker(() => 1000);
    wt.record("a", 10_000);
    expect(wt.record("b", 10_000)).toBe(1);
    wt.reset("a");
    expect(wt.record("a", 10_000)).toBe(1);
  });
});
