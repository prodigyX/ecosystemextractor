import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'

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

async function ghJson(url, token) {
  const res = await fetchTimeout(url, { headers: ghHeaders(token) }, 10000)
  if (res.status === 403 || res.status === 429) throw new Error('rate-limited')
  if (!res.ok) return null
  return res.json()
}

export async function checkGithub(project, ctx) {
  const evidence = []
  const facts = { githubUrl: null, lastPush: null, archived: null, repo: null }
  const link = ctx.links?.github
  if (!link) {
    return { facts, evidence: [ev('info', 'No GitHub link found on site', null, 0)] }
  }
  facts.githubUrl = link

  const parsed = parseGithubUrl(link)
  if (!parsed) return { facts, evidence: [ev('info', 'Unrecognized GitHub URL', link, 0)] }
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

    if (facts.archived) {
      evidence.push(ev('bad', 'GitHub repo archived', repoData.full_name, -25))
      return { facts, evidence }
    }

    const age = daysAgo(repoData.pushed_at)
    if (age == null) {
      evidence.push(ev('info', 'GitHub repo found, no push date', repoData.full_name, 0))
    } else if (age <= 30) {
      evidence.push(ev('good', 'GitHub active (pushed <30d)', `${repoData.full_name} · ${fmtDate(repoData.pushed_at)}`, 15))
    } else if (age <= 90) {
      evidence.push(ev('good', 'GitHub recent (pushed <90d)', `${repoData.full_name} · ${fmtDate(repoData.pushed_at)}`, 8))
    } else if (age <= 365) {
      evidence.push(ev('info', 'GitHub quiet (pushed <1y)', `${repoData.full_name} · ${fmtDate(repoData.pushed_at)}`, 0))
    } else {
      evidence.push(ev('warn', 'GitHub inactive (>1y since push)', `${repoData.full_name} · ${fmtDate(repoData.pushed_at)}`, -10))
    }
  } catch (err) {
    evidence.push(ev('info', 'GitHub check failed', err.message, 0))
  }

  return { facts, evidence }
}
