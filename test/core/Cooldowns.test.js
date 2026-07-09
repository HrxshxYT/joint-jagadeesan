import { describe, it, expect } from "vitest";
import { Cooldowns } from "../../src/core/Cooldowns.js";

describe("Cooldowns", () => {
  it("allows the first use and blocks within the window", () => {
    let t = 1000;
    const cd = new Cooldowns(() => t);
    expect(cd.check("ban", "u1", 5).limited).toBe(false);
    t = 3000; // 2s later
    const second = cd.check("ban", "u1", 5);
    expect(second.limited).toBe(true);
    expect(second.retryAfterMs).toBe(3000);
  });

  it("allows again after the window passes", () => {
    let t = 1000;
    const cd = new Cooldowns(() => t);
    cd.check("ban", "u1", 5);
    t = 7000; // 6s later, past 5s
    expect(cd.check("ban", "u1", 5).limited).toBe(false);
  });

  it("keeps separate windows per user and command", () => {
    const cd = new Cooldowns(() => 1000);
    cd.check("ban", "u1", 5);
    expect(cd.check("ban", "u2", 5).limited).toBe(false);
    expect(cd.check("kick", "u1", 5).limited).toBe(false);
  });
});
