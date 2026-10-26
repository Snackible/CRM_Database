// A short-lived in-memory cache for the per-client summary (twelve-month counts, revenue, standing), which is
// the expensive read behind the Overview, Clients and Insights pages. Every write in this server process clears
// it; another server instance may show figures up to TTL old.
const TTL_MS = 5 * 60_000;
let entry = null;

export function cached(key, compute) {
  if (entry && entry.key === key && Date.now() - entry.at < TTL_MS) return entry.value;
  const value = compute().catch((e) => {
    if (entry?.value === value) entry = null;
    throw e;
  });
  entry = { key, at: Date.now(), value };
  return value;
}

export function invalidate() {
  entry = null;
}
