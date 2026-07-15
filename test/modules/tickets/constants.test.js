import { describe, it, expect } from "vitest";
import { buildId, parseId, KINDS, DEFAULTS, LIMITS } from "../../../src/modules/tickets/constants.js";

describe("ticket custom-id build/parse", () => {
  it("builds a namespaced id", () => {
    expect(buildId(KINDS.OPEN, "panel1")).toBe("ticket:open:panel1");
    expect(buildId(KINDS.OPEN_MODAL, "panel1", "cat2")).toBe("ticket:openmodal:panel1:cat2");
    expect(buildId(KINDS.CLAIM, "t9")).toBe("ticket:claim:t9");
  });

  it("round-trips every kind", () => {
    for (const kind of Object.values(KINDS)) {
      const id = buildId(kind, "a", "b");
      expect(parseId(id)).toEqual({ kind, args: ["a", "b"] });
    }
  });

  it("parses ids with no args", () => {
    expect(parseId("ticket:delete:t1")).toEqual({ kind: "delete", args: ["t1"] });
  });

  it("returns null for non-ticket ids", () => {
    expect(parseId("we:tog:x:o1")).toBeNull();
    expect(parseId("page:next:o1")).toBeNull();
    expect(parseId("")).toBeNull();
  });

  it("exposes defaults and limits", () => {
    expect(DEFAULTS.config.maxOpenPerUser).toBe(1);
    expect(DEFAULTS.category.namePrefix).toBe("ticket");
    expect(LIMITS.maxCategoriesPerPanel).toBe(25);
  });
});
