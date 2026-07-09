import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    globals: false,
    // Dummy DATABASE_URL so PrismaClient can be constructed in unit tests
    // without a live database (queries are always mocked, never executed).
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/discordbot_test",
    },
  },
});
