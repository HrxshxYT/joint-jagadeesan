import { describe, it, expect } from "vitest";
import { AntinukeState } from "../../../src/modules/antinuke/AntinukeState.js";

describe("AntinukeState", () => {
  it("counts actions per guild/action/executor", () => {
    const s = new AntinukeState(() => 1000);
    expect(s.recordAction("g1", "channelDelete", "u1", 10_000)).toBe(1);
    expect(s.recordAction("g1", "channelDelete", "u1", 10_000)).toBe(2);
    expect(s.recordAction("g1", "channelDelete", "u2", 10_000)).toBe(1); // different executor
  });

  it("counts joins per guild independently of actions", () => {
    const s = new AntinukeState(() => 1000);
    s.recordAction("g1", "ban", "u1", 10_000);
    expect(s.recordJoin("g1", 10_000)).toBe(1);
    expect(s.recordJoin("g1", 10_000)).toBe(2);
  });
});
