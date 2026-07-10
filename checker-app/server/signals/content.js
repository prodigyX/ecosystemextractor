import { createHash } from 'node:crypto'
import { ev, fmtDate } from '../util.js'

const DEAD_KEYWORDS = [
  'shutting down', 'shut down', 'has shutdown', 'is shutting',
  'sunsetting', 'sunset the', 'has been sunset',
  'discontinued', 'no longer available', 'no longer supported',
  'ceased operations', 'winding down', 'wind down',
  'project has ended', 'deprecated',
]
const MIGRATION_KEYWORDS = [
  'we have migrated', 'has migrated to', 'moved to a new',
  'find us at our new', 'rebranded to', 'now known as',
]
const PARKED_SIGNS = [
  'this domain is for sale', 'buy this domain', 'domain is parked',
  'parked free', 'godaddy.com/domains', 'sedo.com',
]

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function findLinks(html, baseUrl) {
  const links = { github: null, discord: null, telegram: null }
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
  for (const href of hrefs) {
    let url
    try {
      url = new URL(href, baseUrl).href
    } catch {
      continue
    }
    if (!links.github && /github\.com\/[\w.-]+/i.test(url)) links.github = url
    if (!links.discord && /(discord\.gg|discord\.com\/invite)\/[\w-]+/i.test(url)) links.discord = url
    if (!links.telegram && /t\.me\/[\w+]+/i.test(url)) links.telegram = url
  }
  return links
}

/**
 * Analyzes homepage HTML: dead/migration keywords, parked-domain signs,
 * copyright year, social link discovery, and content hash vs stored baseline.
 */
export function checkContent(project, ctx) {
  const evidence = []
  const facts = { links: {}, copyrightYear: null, contentHash: null, contentChanged: null }
  const html = ctx.html
  if (!html) {
    return { facts, evidence: [ev('info', 'No HTML to analyze', null, 0)] }
  }

  const text = stripTags(html)

  // Keyword scans
  const deadHit = DEAD_KEYWORDS.find((k) => text.includes(k))
  if (deadHit) evidence.push(ev('bad', 'Shutdown language on homepage', `"${deadHit}"`, -30))

  const migHit = MIGRATION_KEYWORDS.find((k) => text.includes(k))
  if (migHit) evidence.push(ev('warn', 'Migration language on homepage', `"${migHit}"`, -12))

  const parkedHit = PARKED_SIGNS.find((k) => text.includes(k))
  if (parkedHit) evidence.push(ev('bad', 'Domain appears parked/for sale', `"${parkedHit}"`, -30))

  // Copyright year staleness
  const yearMatches = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g)]
  if (yearMatches.length) {
    const year = Math.max(...yearMatches.map((m) => parseInt(m[1], 10)))
    const now = new Date().getFullYear()
    if (year >= 2000 && year <= now + 1) {
      facts.copyrightYear = year
      if (now - year >= 2) {
        evidence.push(ev('warn', 'Stale copyright year', `© ${year}`, -5))
      } else {
        evidence.push(ev('info', 'Copyright year current', `© ${year}`, 0))
      }
    }
  }

  // Link discovery for downstream signals
  facts.links = findLinks(html, ctx.finalUrl || project.website)
  const found = Object.entries(facts.links).filter(([, v]) => v).map(([k]) => k)
  if (found.length) {
    evidence.push(ev('info', 'Discovered links', found.join(', '), 0))
  }

  // Content hash vs stored baseline
  facts.contentHash = createHash('sha256').update(text).digest('hex').slice(0, 16)
  if (ctx.store) {
    const key = ctx.storeKey
    const prev = ctx.store.get(key)
    const nowIso = new Date().toISOString()
    if (prev?.hash) {
      if (prev.hash === facts.contentHash) {
        facts.contentChanged = false
        const since = prev.lastChanged || prev.firstSeen
        if (since) {
          evidence.push(ev('info', 'Homepage unchanged since', fmtDate(since), 0))
        }
        ctx.store.set(key, { ...prev, lastChecked: nowIso })
      } else {
        facts.contentChanged = true
        evidence.push(ev('good', 'Homepage content changed since last check', null, 3))
        ctx.store.set(key, { ...prev, hash: facts.contentHash, lastChanged: nowIso, lastChecked: nowIso })
      }
    } else {
      ctx.store.set(key, { hash: facts.contentHash, firstSeen: nowIso, lastChecked: nowIso })
      evidence.push(ev('info', 'Content baseline saved (first check)', null, 0))
    }
  }

  return { facts, evidence }
}
