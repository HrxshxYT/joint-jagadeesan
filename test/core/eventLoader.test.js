import { describe, it, expect } from "vitest";
import { bindEvents } from "../../src/core/EventHandler.js";

describe("bindEvents with array-friendly listeners", () => {
  it("binds a flat list of listeners (arrays are flattened by the loader before this)", () => {
    const bound = [];
    const client = { on: (name, h) => bound.push([name, h]), once: () => {} };
    const listeners = [
      { name: "a", execute: () => {} },
      { name: "b", execute: () => {} },
    ];
    bindEvents(client, listeners, { ctx: true });
    expect(bound.map((b) => b[0])).toEqual(["a", "b"]);
  });
});
