import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "123",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};

describe("loadEnv", () => {
  it("parses a valid environment with defaults", () => {
    const env = loadEnv(base);
    expect(env.token).toBe("t");
    expect(env.clientId).toBe("123");
    expect(env.nodeEnv).toBe("development");
    expect(env.shardCount).toBe("auto");
    expect(env.logLevel).toBe("info");
  });

  it("coerces a numeric BOT_SHARD_COUNT", () => {
    const env = loadEnv({ ...base, BOT_SHARD_COUNT: "4" });
    expect(env.shardCount).toBe(4);
  });

  it("ignores the reserved SHARD_COUNT env var (discord.js collision)", () => {
    // SHARD_COUNT is read by discord.js itself; our config must not depend on it.
    const env = loadEnv({ ...base, SHARD_COUNT: "auto" });
    expect(env.shardCount).toBe("auto"); // default, not driven by SHARD_COUNT
  });

  it("throws when a required var is missing", () => {
    expect(() => loadEnv({ DISCORD_TOKEN: "t" })).toThrow(/DISCORD_CLIENT_ID|DATABASE_URL/);
  });
});
