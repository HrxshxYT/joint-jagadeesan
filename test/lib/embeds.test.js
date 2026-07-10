import { describe, it, expect } from "vitest";
import { successEmbed, errorEmbed, infoEmbed } from "../../src/lib/embeds.js";
import { COLORS } from "../../src/lib/constants.js";

describe("embeds", () => {
  it("builds a success embed with the success color", () => {
    const e = successEmbed("done");
    expect(e.data.color).toBe(COLORS.success);
    expect(e.data.description).toContain("done");
  });
  it("builds an error embed with the error color", () => {
    const e = errorEmbed("nope");
    expect(e.data.color).toBe(COLORS.error);
  });
  it("builds an info embed with a title", () => {
    const e = infoEmbed("Title", "body");
    expect(e.data.title).toBe("Title");
    expect(e.data.color).toBe(COLORS.info);
  });
});
