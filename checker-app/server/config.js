// Central server configuration. Change these values to tune checks without
// hunting through the signal implementations.
export const BERACHAIN_DIRECTORY_URL = 'https://explore.berachain.com/'

// Rate-limit protection for X and GitHub: before calling either live API for
// a given record (an X handle, or a GitHub owner/repo — see the `x:<handle>`
// and `github:<owner>/<repo>` cache keys in server/signals/x.js and
// server/signals/github.js), check that record's own last-*successful*-fetch
// timestamp in the server-side store (server/store.js). Only make the live
// call if it has been more than this many days since that record's last
// successful fetch; otherwise reuse the cached result. This is the single,
// per-record rule for both signals — replacing the previous separate
// 1hr/7d/30d tiers.
export const SIGNAL_FRESH_FETCH_DAYS = 5
export const SIGNAL_FRESH_FETCH_MS = SIGNAL_FRESH_FETCH_DAYS * 24 * 60 * 60 * 1000

// Durable X fallback (server/xFallback.js): a separate table from the
// regular signal cache above, never wiped by "Clear check cache". It's a
// hard floor on how often X gets a live call, independent of the working
// cache — clearing the cache must not become a way to bypass X's own rate
// limits via repeated clear-then-recheck cycles. Only overwritten when a
// live fetch actually produces a usable result (never with a lesser/empty
// one), and only consulted once the regular cache above is stale/cleared.
export const X_FALLBACK_REFETCH_DAYS = 7
export const X_FALLBACK_REFETCH_MS = X_FALLBACK_REFETCH_DAYS * 24 * 60 * 60 * 1000

// Same durable-fallback pattern for GitHub (server/githubFallback.js), but
// with a much shorter floor: GitHub's API is reliable and has a generous
// quota, so there's little reason to withhold a refetch as long as X needs.
export const GITHUB_FALLBACK_REFETCH_DAYS = 1
export const GITHUB_FALLBACK_REFETCH_MS = GITHUB_FALLBACK_REFETCH_DAYS * 24 * 60 * 60 * 1000

export const X_RESULT_CACHE_ENABLED = true
export const GITHUB_RESULT_CACHE_ENABLED = true

// Activity age bands are expressed in days. Keep values in ascending order.
export const X_LAST_POST_AGE_DAYS = Object.freeze({ active: 30, recent: 90, quiet: 180, silent: 365 })

// X follower-count bands. Below `veryLow`, a thin audience is treated as a
// possible clone/scam signal (bad, caps the overall score) rather than just
// a weak one — a real project's account rarely sits under ~1.5K followers.
export const X_FOLLOWER_THRESHOLDS = Object.freeze({ veryLow: 1500, weak: 3000, decent: 5000, established: 20000 })

export const X_SYNDICATION_INTERVAL_MS = 10 * 1000
export const X_SYNDICATION_COOLDOWN_MS = 15 * 60 * 1000

export const GITHUB_PUSH_AGE_DAYS = Object.freeze({ active: 30, recent: 90, inactive: 365 })

export const TELEGRAM_MESSAGE_AGE_DAYS = Object.freeze({ active: 30, recent: 90, inactive: 365 })
export const SITEMAP_UPDATE_AGE_DAYS = Object.freeze({ recent: 90, stale: 365 })
