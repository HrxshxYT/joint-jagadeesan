export function evaluate({ count, limit, panic = false }) {
  const effectiveLimit = panic ? 1 : limit;
  return { triggered: count >= effectiveLimit };
}
