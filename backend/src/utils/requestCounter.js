/**
 * Per-process rolling request counter for the Admin "API Throughput" tile.
 *
 * Keeps a rolling window of the last 60s of request timestamps. Exposed via
 * `getRollingThroughput()` so the admin infra-metrics endpoint can report
 * `req/min` derived from the actual live request stream — no in-memory
 * "42 req/min" hardcoded value.
 *
 * Made global so the middleware (mounted in `index.js`) and the controller
 * (mounted in `stats.js`) share the same counter without needing to thread
 * an instance through the request lifecycle.
 *
 * `getRollingThroughput()` returns the request count in the rolling 60s
 * window AND the window size in seconds, so the caller can render the
 * tile label as "N req/min" while still showing "Rolling 60s window" in
 * the sub-label.
 */
const requests = [];

const WINDOW_SECONDS = 60;

export function requestCounterMiddleware(req, res, next) {
  // Only count requests that actually reached the application router —
  // static 404s, preflight CORS, and the `/health` self-check are excluded
  // so the throughput card reflects user/system traffic, not noise.
  if (req.path === '/health') return next();
  if (req.method === 'OPTIONS') return next();

  requests.push(Date.now());
  // Prune timestamps older than the window. O(n) but n is bounded by
  // the rate limit (150 req/min globally) so the array is small in
  // practice; trimming on every request keeps it bounded without a
  // separate timer.
  const cutoff = Date.now() - WINDOW_SECONDS * 1000;
  while (requests.length > 0 && requests[0] < cutoff) {
    requests.shift();
  }
  next();
}

/**
 * Returns the current rolling throughput.
 *
 * `count` is the number of requests in the last 60s.
 * `windowSec` is the window size (exposed for the frontend sub-label).
 */
export function getRollingThroughput() {
  const cutoff = Date.now() - WINDOW_SECONDS * 1000;
  while (requests.length > 0 && requests[0] < cutoff) {
    requests.shift();
  }
  return { count: requests.length, windowSec: WINDOW_SECONDS };
}
