// Fixed-size worker pool. Never fires all requests at once — at most
// `concurrency` are in flight. Failures are collected, not thrown, so a
// partial lockdown still records which targets succeeded.
export async function runBatched(items, worker, { concurrency = 6, onProgress } = {}) {
  const succeeded = [];
  const failed = [];
  let next = 0;
  let done = 0;
  const total = items.length;

  async function pump() {
    while (next < total) {
      const index = next++;
      const item = items[index];
      try {
        succeeded.push(await worker(item, index));
      } catch (error) {
        failed.push({ item, error });
      }
      done++;
      onProgress?.(done, total);
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, total) }, () => pump());
  await Promise.all(pool);
  return { succeeded, failed };
}
