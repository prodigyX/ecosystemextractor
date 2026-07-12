/**
 * Best-effort in-process rate limiter: a fixed window per key (typically
 * client IP), held in a plain Map like server/store.js. This deters casual
 * abuse of write-capable and expensive endpoints (saving to Postgres,
 * clearing the cache, running a live Berachain scrape or a deep check) —
 * it is NOT a substitute for real protection against distributed abuse.
 * It resets on restart and is not shared across concurrent serverless
 * instances; for genuine DDoS/abuse protection, use Vercel's platform-level
 * Firewall (Project Settings -> Firewall) in addition to this.
 */
const buckets = new Map()

/** Occasionally sweep expired buckets so long-running processes don't accumulate one entry per distinct IP forever. */
function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > bucket.windowMs) buckets.delete(key)
  }
}

/**
 * @param {string} key usually `${routeName}:${clientIp}`
 * @param {{limit?: number, windowMs?: number}} [options]
 * @returns {boolean} true if this call should be rejected (limit exceeded)
 */
export function isRateLimited(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now()
  if (Math.random() < 0.01) sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now, windowMs })
    return false
  }
  bucket.count++
  return bucket.count > limit
}
