import { describe, it, expect } from "vitest";
import { renderTemplate, parseEmoji } from "../../../src/modules/welcome/render.js";

const member = { id: "u1", user: { tag: "Ann#0001", username: "Ann" } };
const guild = { name: "Cool Server", memberCount: 42 };

describe("renderTemplate", () => {
  it("replaces every placeholder", () => {
    const out = renderTemplate(
      "Hi {mention} ({user}/{username}) welcome to {server} #{memberCount}",
      { member, guild },
    );
    expect(out).toBe("Hi <@u1> (Ann#0001/Ann) welcome to Cool Server #42");
  });
  it("handles repeated placeholders and empty template", () => {
    expect(renderTemplate("{server} {server}", { member, guild })).toBe("Cool Server Cool Server");
    expect(renderTemplate("", { member, guild })).toBe("");
    expect(renderTemplate(null, { member, guild })).toBe("");
  });
  it("falls back gracefully when user fields are missing", () => {
    const bare = { id: "u9", user: {} };
    const out = renderTemplate("{user}-{username}-{mention}", { member: bare, guild });
    expect(out).toBe("u9-member-<@u9>");
  });
});

describe("parseEmoji", () => {
  it("parses a custom emoji to its id", () => {
    expect(parseEmoji("<:smile:12345>")).toEqual({ react: "12345", key: "12345" });
    expect(parseEmoji("<a:party:98765>")).toEqual({ react: "98765", key: "98765" });
  });
  it("passes a unicode emoji through", () => {
    expect(parseEmoji("😀")).toEqual({ react: "😀", key: "😀" });
  });
});
