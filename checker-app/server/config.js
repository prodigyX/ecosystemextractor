// Central server configuration. Change these values to tune checks without
// hunting through the signal implementations.
export const BERACHAIN_DIRECTORY_URL = 'https://explore.berachain.com/'

// Feature flags exposed to the client via GET /api/app-config (see
// api/app-config.js) — flip here to re-enable, no other code changes needed.
// "Upload JSON" is purely client-side (FileReader, no server endpoint), so
// this flag only controls whether the UI offers the button/drop-zone at all.
export const UPLOAD_JSON_ENABLED = false

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
export const X_FALLBACK_REFETCH_DAYS = 30
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

// Every non-zero score delta used by server/signals/*.js, grouped by signal.
// Each project's score starts at 50 and every piece of evidence below adds
// or subtracts from it (see server/pipeline.js) — tune scoring here instead
// of hunting through each signal's implementation. Evidence with a delta of
// 0 (purely informational — "no data available", "link discovered", etc.)
// isn't listed here since there's nothing to tune.
export const SCORE_WEIGHTS = Object.freeze({
  http: {
    unreachable: -35,
    redirectLoop: -20,
    up: 32,
    botBlocked: 12,
    clientError: -18,
    serverError: -26,
    crossDomainRedirect: -10,
  },
  dnsSsl: {
    invalidUrl: -10,
    dnsResolves: 2,
    dnsFails: -18,
    sslExpired: -10,
    sslExpiringSoon: -2,
    sslUntrusted: -3,
    sslValid: 3,
    httpsHandshakeFailed: -5,
  },
  domain: {
    notRegistered: -12,
    expired: -15,
    expiresSoon: -5,
    registrationHealthy: 3,
  },
  content: {
    shutdownLanguage: -30,
    migrationLanguage: -12,
    parkedDomain: -30,
    staleCopyrightYear: -3,
    unchangedOverYear: -8,
    contentChanged: 2,
  },
  sitemap: {
    updatedRecent: 4,
    updatedWithinStale: 1,
    stale: -3,
  },
  x: {
    noLink: -15,
    followerVeryLow: -15,
    followerWeak: -4,
    followerSmall: 3,
    followerDecent: 6,
    followerEstablished: 10,
    postActive: 20,
    postRecent: 12,
    postQuiet: -8,
    postSilentOverQuiet: -25,
    postSilentOverSilent: -32,
  },
  github: {
    archived: -25,
    active: 15,
    recent: 8,
    inactiveOverYear: -25,
    notFoundOrEmpty: -5,
  },
  discord: {
    inviteValid: 2,
    large: 6,
    healthy: 5,
    small: 2,
    tiny: -25,
    inviteExpired: -25,
  },
  telegram: {
    active: 5,
    recent: 3,
    quiet: -2,
    dead: -5,
  },
  // Cross-signal: applied once in server/pipeline.js after both Discord and
  // Telegram have been checked, only when NEITHER community link was found
  // on the homepage. Having just one of the two is normal and unpenalized;
  // having neither is the real red flag — a single -15, not two stacked
  // per-signal penalties for what's really one gap.
  community: {
    noSocialLink: -15,
  },
  defillama: {
    meaningfulTvl: 12,
    lowTvl: 2,
    nearZeroTvl: -8,
  },
})
