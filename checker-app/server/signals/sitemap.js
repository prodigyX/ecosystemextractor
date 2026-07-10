import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'

const FEED_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/feed', '/rss', '/feed.xml', '/blog/rss.xml']

function latestDateIn(xml) {
  const dates = [
    ...(xml.match(/<lastmod>([^<]+)<\/lastmod>/g) || []).map((m) => m.replace(/<\/?lastmod>/g, '')),
    ...(xml.match(/<pubDate>([^<]+)<\/pubDate>/g) || []).map((m) => m.replace(/<\/?pubDate>/g, '')),
    ...(xml.match(/<updated>([^<]+)<\/updated>/g) || []).map((m) => m.replace(/<\/?updated>/g, '')),
  ]
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t) && t <= Date.now() + 86400000)
  return dates.length ? new Date(Math.max(...dates)) : null
}

export async function checkSitemap(project, ctx = {}) {
  const evidence = []
  const facts = { lastPublished: null, feedFound: null }
  const base = ctx.finalUrl || project.website
  if (!base) return { facts, evidence }

  let origin
  try {
    origin = new URL(base).origin
  } catch {
    return { facts, evidence }
  }

  for (const path of FEED_PATHS) {
    try {
      const res = await fetchTimeout(origin + path, {}, 8000)
      if (!res.ok) continue
      const text = (await res.text()).slice(0, 500 * 1024)
      if (!text.includes('<')) continue
      const latest = latestDateIn(text)
      if (latest) {
        facts.lastPublished = latest.toISOString()
        facts.feedFound = path
        const age = daysAgo(latest)
        if (age <= 90) {
          evidence.push(ev('good', 'Site content updated recently', `${path} → ${fmtDate(latest)}`, 8))
        } else if (age <= 365) {
          evidence.push(ev('info', 'Site content updated within a year', `${path} → ${fmtDate(latest)}`, 2))
        } else {
          evidence.push(ev('warn', 'Site content stale (>1 year)', `${path} → ${fmtDate(latest)}`, -5))
        }
        return { facts, evidence }
      }
    } catch {
      /* try next path */
    }
  }

  evidence.push(ev('info', 'No sitemap/RSS dates found', null, 0))
  return { facts, evidence }
}
