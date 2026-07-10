import { describe, it, expect } from "vitest";
import { AutomodState } from "../../../src/modules/automod/AutomodState.js";

describe("AutomodState", () => {
  it("counts a user's messages within the window", () => {
    const s = new AutomodState(() => 1000);
    expect(s.recordMessage("g1", "u1", 5000)).toBe(1);
    expect(s.recordMessage("g1", "u1", 5000)).toBe(2);
    expect(s.recordMessage("g1", "u2", 5000)).toBe(1);
  });
});
