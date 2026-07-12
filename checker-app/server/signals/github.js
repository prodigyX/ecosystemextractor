import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'
import { GITHUB_PUSH_AGE_DAYS, GITHUB_RESULT_CACHE_ENABLED, SIGNAL_FRESH_FETCH_MS } from '../config.js'
import { recordGithubRateLimit } from '../rateLimitStatus.js'

function ghHeaders(token) {
  const h = { Accept: 'application/vnd.github+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function parseGithubUrl(url) {
  const m = url.match(/github\.com\/([\w.-]+)(?:\/([\w.-]+))?/i)
  if (!m) return null
  const owner = m[1]
  const repo = m[2]?.replace(/\.git$/, '')
  if (['orgs', 'sponsors', 'features', 'topics', 'search'].includes(owner.toLowerCase())) return null
  return { owner, repo: repo || null }
}

/**
 * Returns the parsed JSON body for a confirmed-successful lookup, or `null`
 * for a confirmed 404 (repo/user genuinely doesn't exist) — the only two
 * outcomes callers should treat as a definitive answer. Anything else
 * (rate-limited, timeout, 5xx, malformed response) throws, so callers report
 * it as inconclusive rather than mistaking it for a confirmed absence.
 */
async function ghJson(url, token) {
  const res = await fetchTimeout(url, { headers: ghHeaders(token) }, 10000)
  // Capture the live quota headers regardless of outcome — this is a genuine
  // live call, unlike a cache hit, so it's the only place that can tell the
  // footer anything new about the current GitHub quota.
  await recordGithubRateLimit(res.headers)
  if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate-limited')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  return res.json()
}

function activityEvidence(facts) {
  if (facts.archived) {
    return ev('bad', 'GitHub repo archived', facts.repo, -25)
  }

  const age = daysAgo(facts.lastPush)
  if (age == null) return ev('info', 'GitHub repo found, no push date', facts.repo, 0)
  const detail = `${facts.repo} · ${fmtDate(facts.lastPush)}`
  if (age <= GITHUB_PUSH_AGE_DAYS.active) return ev('good', `GitHub active (pushed ≤${GITHUB_PUSH_AGE_DAYS.active}d)`, detail, 15)
  if (age <= GITHUB_PUSH_AGE_DAYS.recent) return ev('good', `GitHub recent (pushed ≤${GITHUB_PUSH_AGE_DAYS.recent}d)`, detail, 8)
  if (age <= GITHUB_PUSH_AGE_DAYS.inactive) return ev('info', `GitHub quiet (pushed ≤${GITHUB_PUSH_AGE_DAYS.inactive}d)`, detail, 0)
  return ev('warn', `GitHub inactive (>${GITHUB_PUSH_AGE_DAYS.inactive}d since push)`, detail, -10)
}

export async function checkGithub(project, ctx) {
  const evidence = []
  const facts = { githubUrl: null, lastPush: null, archived: null, repo: null, githubSource: null }
  const link = ctx.links?.github
  if (!link) {
    return { facts, evidence: [ev('info', 'No GitHub link found on site', null, 0)] }
  }
  facts.githubUrl = link

  const parsed = parseGithubUrl(link)
  if (!parsed) return { facts, evidence: [ev('info', 'Unrecognized GitHub URL', link, 0)] }
  // Rate-limit protection: this record (this exact owner/repo) only gets a
  // live GitHub API call if it's been more than SIGNAL_FRESH_FETCH_DAYS since
  // its own last successful fetch — otherwise reuse the cached result and
  // skip the live call entirely. Each repo's cache entry is independent.
  const cacheKey = `github:${parsed.owner.toLowerCase()}/${parsed.repo?.toLowerCase() ?? '*'}`
  const cached = ctx.store?.get(cacheKey)
  const checkedAt = cached?.checkedAt ? new Date(cached.checkedAt).getTime() : NaN
  const cacheAge = Number.isNaN(checkedAt) ? Infinity : Date.now() - checkedAt
  if (
    GITHUB_RESULT_CACHE_ENABLED &&
    cached?.result?.repo &&
    cacheAge < SIGNAL_FRESH_FETCH_MS
  ) {
    Object.assign(facts, cached.result, { githubUrl: link, githubSource: 'cache' })
    return { facts, evidence: [activityEvidence(facts)] }
  }

  const token = ctx.env?.GITHUB_TOKEN

  try {
    let repoData = null
    if (parsed.repo) {
      repoData = await ghJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, token)
    }
    if (!repoData) {
      // Org/user link (or repo 404): take their most recently pushed public repo
      const repos = await ghJson(
        `https://api.github.com/users/${parsed.owner}/repos?sort=pushed&per_page=1`,
        token
      )
      repoData = Array.isArray(repos) ? repos[0] : null
    }

    if (!repoData) {
      evidence.push(ev('warn', 'GitHub org/repo not found or empty', link, -5))
      return { facts, evidence }
    }

    facts.repo = repoData.full_name
    facts.archived = repoData.archived === true
    facts.lastPush = repoData.pushed_at
    facts.githubSource = 'api'
    ctx.store?.set(cacheKey, {
      checkedAt: new Date().toISOString(),
      result: { repo: facts.repo, archived: facts.archived, lastPush: facts.lastPush },
    })
    evidence.push(activityEvidence(facts))
  } catch (err) {
    evidence.push(ev('info', 'GitHub check failed', err.message, 0))
  }

  return { facts, evidence }
}
