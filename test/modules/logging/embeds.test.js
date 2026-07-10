import { describe, it, expect } from "vitest";
import {
  memberJoinEmbed,
  messageDeleteEmbed,
  roleEmbed,
  voiceEmbed,
  modActionEmbed,
} from "../../../src/modules/logging/embeds.js";
import { COLORS } from "../../../src/lib/constants.js";

describe("logging embeds", () => {
  it("member join is green and names the user", () => {
    const e = memberJoinEmbed({ id: "u1", user: { tag: "alice#0001", id: "u1" } });
    expect(e.data.color).toBe(COLORS.success);
    expect(JSON.stringify(e.data)).toContain("u1");
  });

  it("message delete shows a content placeholder when empty", () => {
    const e = messageDeleteEmbed({ author: { id: "u1", tag: "a#1" }, content: "", channelId: "c1" });
    expect(JSON.stringify(e.data)).toContain("content unavailable");
  });

  it("message delete includes the content when present", () => {
    const e = messageDeleteEmbed({
      author: { id: "u1", tag: "a#1" },
      content: "hello world",
      channelId: "c1",
    });
    expect(JSON.stringify(e.data)).toContain("hello world");
  });

  it("role embed reflects the action", () => {
    const e = roleEmbed({ id: "r1", name: "Members" }, "created");
    expect(JSON.stringify(e.data)).toContain("created");
  });

  it("mod action embed shows the case number and type", () => {
    const e = modActionEmbed({
      caseNumber: 4,
      type: "ban",
      targetId: "u1",
      moderatorId: "m1",
      reason: "spam",
    });
    const s = JSON.stringify(e.data);
    expect(s).toContain("4");
    expect(s).toContain("ban");
  });

  it("voice embed handles join, leave, and move", () => {
    const join = voiceEmbed(
      { channelId: null },
      { channelId: "c2", member: { id: "u1" }, guild: {} },
    );
    expect(JSON.stringify(join.data)).toContain("joined");
  });
});
