// Central server configuration. Change these values to tune checks without
// hunting through the signal implementations.
export const BERACHAIN_DIRECTORY_URL = 'https://explore.berachain.com/'

// Short cache for conclusive X results that do not contain a last-post date.
export const X_RESULT_CACHE_ENABLED = true
export const X_RESULT_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// A successfully acquired last-post date is expensive and changes slowly.
// While this is enabled, reuse it for 30 days without calling any X source.
export const X_LAST_POST_CACHE_ENABLED = true
export const X_LAST_POST_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Activity age bands are expressed in days. Keep values in ascending order.
export const X_LAST_POST_AGE_DAYS = Object.freeze({ active: 30, recent: 90, quiet: 180, silent: 365 })

export const X_STALE_POST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const X_SYNDICATION_INTERVAL_MS = 10 * 1000
export const X_SYNDICATION_COOLDOWN_MS = 15 * 60 * 1000

// Reuse a successful GitHub repository/activity lookup to protect both
// authenticated and public GitHub API rate limits.
export const GITHUB_RESULT_CACHE_ENABLED = true
export const GITHUB_RESULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const GITHUB_PUSH_AGE_DAYS = Object.freeze({ active: 30, recent: 90, inactive: 365 })

export const TELEGRAM_MESSAGE_AGE_DAYS = Object.freeze({ active: 30, recent: 90, inactive: 365 })
export const SITEMAP_UPDATE_AGE_DAYS = Object.freeze({ recent: 90, stale: 365 })
