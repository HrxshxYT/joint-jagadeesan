import { describe, it, expect, vi } from "vitest";
import { Scheduler } from "../../src/core/Scheduler.js";

function fakeCron() {
  const jobs = [];
  return {
    jobs,
    schedule: vi.fn((expr, fn) => {
      const job = { expr, fn, stop: vi.fn() };
      jobs.push(job);
      return job;
    }),
  };
}
const logger = { error: vi.fn(), info: vi.fn() };

describe("Scheduler", () => {
  it("schedules a named job", () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "cleanup", async () => {});
    expect(cron.schedule).toHaveBeenCalledOnce();
  });

  it("wraps task errors so they never throw out of the job", async () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "boom", async () => {
      throw new Error("fail");
    });
    await cron.jobs[0].fn(); // invoke the wrapped task
    expect(logger.error).toHaveBeenCalled();
  });

  it("stops all jobs", () => {
    const cron = fakeCron();
    const s = new Scheduler({ cron, logger });
    s.every("* * * * *", "a", async () => {});
    s.stopAll();
    expect(cron.jobs[0].stop).toHaveBeenCalled();
  });
});
