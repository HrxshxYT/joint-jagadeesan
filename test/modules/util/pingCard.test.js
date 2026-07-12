import { describe, it, expect } from "vitest";
import { formatUptime, sparklinePoints, buildPingCard } from "../../../src/modules/util/pingCard.js";

describe("formatUptime", () => {
  it("formats days/hours/minutes", () => {
    expect(formatUptime(0)).toBe("0m");
    expect(formatUptime(60_000)).toBe("1m");
    expect(formatUptime(3_600_000)).toBe("1h 0m");
    expect(formatUptime(90_061_000)).toBe("1d 1h 1m");
  });
});

describe("sparklinePoints", () => {
  it("returns [] for no samples", () => {
    expect(sparklinePoints([], { width: 100, height: 40 })).toEqual([]);
  });
  it("maps a normal series with higher values nearer the top (smaller y)", () => {
    const pts = sparklinePoints([0, 100], { width: 100, height: 40 });
    expect(pts).toEqual([{ x: 0, y: 40 }, { x: 100, y: 0 }]);
  });
  it("draws a flat line for a constant series", () => {
    const pts = sparklinePoints([30, 30], { width: 100, height: 40 });
    expect(pts.map((p) => p.y)).toEqual([40, 40]);
    expect(pts.map((p) => p.x)).toEqual([0, 100]);
  });
});

describe("buildPingCard", () => {
  it("renders a non-empty PNG (with a sparkline)", async () => {
    const buf = await buildPingCard({ samples: [40, 55, 48, 60, 52], currentPing: 52, uptimeMs: 3_600_000 });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
  it("renders a non-empty PNG in the collecting state (<2 samples)", async () => {
    const buf = await buildPingCard({ samples: [], currentPing: -1, uptimeMs: 0 });
    expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
