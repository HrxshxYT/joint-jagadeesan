import { describe, it, expect } from "vitest";
import { evaluate } from "../../../src/modules/antinuke/engine.js";

describe("evaluate", () => {
  it("does not trigger below the limit", () => {
    expect(evaluate({ count: 2, limit: 3 }).triggered).toBe(false);
  });
  it("triggers at or above the limit", () => {
    expect(evaluate({ count: 3, limit: 3 }).triggered).toBe(true);
    expect(evaluate({ count: 4, limit: 3 }).triggered).toBe(true);
  });
  it("triggers on the first event in panic mode", () => {
    expect(evaluate({ count: 1, limit: 99, panic: true }).triggered).toBe(true);
  });
});
