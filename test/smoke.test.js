import { describe, it, expect } from "vitest";
import { COLORS, LIMITS } from "../src/lib/constants.js";

describe("constants", () => {
  it("exposes brand colors and limits", () => {
    expect(COLORS.success).toBe(0x57f287);
    expect(LIMITS.embedDescription).toBe(4096);
  });
});
