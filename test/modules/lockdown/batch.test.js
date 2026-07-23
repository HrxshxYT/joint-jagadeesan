import { describe, it, expect, vi } from "vitest";
import { runBatched } from "../../../src/modules/lockdown/batch.js";

describe("runBatched", () => {
  it("processes all items and reports progress per completion", async () => {
    const items = [1, 2, 3, 4, 5];
    const progress = [];
    const res = await runBatched(items, async (n) => n * 2, {
      concurrency: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(res.succeeded.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
    expect(res.failed).toEqual([]);
    expect(progress.at(-1)).toEqual([5, 5]);
  });

  it("continues past failures and records them", async () => {
    const items = ["a", "b", "c"];
    const res = await runBatched(
      items,
      async (x) => {
        if (x === "b") throw new Error("boom");
        return x.toUpperCase();
      },
      { concurrency: 3 },
    );
    expect(res.succeeded.sort()).toEqual(["A", "C"]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].item).toBe("b");
    expect(res.failed[0].error.message).toBe("boom");
  });

  it("never runs more than `concurrency` workers at once", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runBatched(
      items,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
      { concurrency: 4 },
    );
    expect(peak).toBeLessThanOrEqual(4);
  });
});
