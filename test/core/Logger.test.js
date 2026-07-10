import { describe, it, expect } from "vitest";
import { createLogger } from "../../src/core/Logger.js";

describe("createLogger", () => {
  it("creates a logger at the requested level", () => {
    const log = createLogger({ level: "debug", pretty: false });
    expect(log.level).toBe("debug");
    expect(typeof log.info).toBe("function");
  });
});
