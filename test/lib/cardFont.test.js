import { describe, it, expect } from "vitest";
import { ensureCardFont } from "../../src/lib/cardFont.js";

describe("ensureCardFont", () => {
  it("returns the shared family name", () => {
    expect(ensureCardFont()).toBe("BotSans");
  });
  it("is idempotent (safe to call repeatedly)", () => {
    expect(ensureCardFont()).toBe("BotSans");
    expect(ensureCardFont()).toBe("BotSans");
  });
});
