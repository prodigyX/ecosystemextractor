import { VERDICTS, overallStatus } from '../shared/domain/scoring.js'

const HEADERS = [
  'Name', 'Website', 'Final URL', 'HTTP Status', 'Website Status',
  'X (Twitter)', 'X Handle', 'X Status', 'X Exists', 'X Last Post', 'X Followers',
  'Overall (Quick)', 'Score', 'Verdict',
  'SSL Expires', 'Domain Expires', 'Registrar',
  'Copyright Year', 'Content Changed', 'Site Last Published',
  'GitHub Repo', 'GitHub Last Push', 'GitHub Archived',
  'Discord Members', 'Telegram Last Post',
  'TVL (USD)', 'TVL 7d Change (%)',
  'Positive Points', 'Negative Points', 'Evidence Details',
]

const OVERALL_LABELS = {
  'both-alive': 'Alive', 'web-only': 'Maybe', 'x-only': 'Possibly Dead',
  'both-dead': 'Dead', checking: 'Checking', idle: '',
}

function esc(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function day(iso) {
  return iso ? String(iso).slice(0, 10) : ''
}

function yn(v) {
  return v === true ? 'yes' : v === false ? 'no' : ''
}

function evidenceDetails(evList) {
  // Full audit trail: every evidence item with signal, level, detail, and points
  return evList
    .map((e) => {
      const pts = e.delta ? ` (${e.delta > 0 ? '+' : ''}${e.delta})` : ''
      const det = e.detail ? ` — ${e.detail}` : ''
      return `[${e.signal}] ${e.level.toUpperCase()}: ${e.label}${det}${pts}`
    })
    .join('\n')
}

function projectRow(p, deep) {
  const d = deep[p.id]
  const f = d?.facts ?? {}
  const evList = d?.evidence ?? []
  const positive = evList.reduce((n, e) => n + (e.delta > 0 ? e.delta : 0), 0)
  const negative = evList.reduce((n, e) => n + (e.delta < 0 ? e.delta : 0), 0)

  return [
    esc(p.name),
    p.website ?? '',
    f.finalUrl && f.finalUrl !== p.website ? f.finalUrl : '',
    f.status ?? '',
    p.websiteStatus,
    p.x ?? '',
    f.xHandle ? `@${f.xHandle}` : '',
    p.xStatus,
    yn(f.xExists),
    day(f.xLatestPost),
    f.xFollowers ?? '',
    OVERALL_LABELS[overallStatus(p.websiteStatus, p.xStatus)] ?? '',
    d?.score ?? '',
    d?.verdict ? (VERDICTS[d.verdict]?.[1] ?? d.verdict) : '',
    f.sslValidTo && !Number.isNaN(new Date(f.sslValidTo).getTime())
      ? day(new Date(f.sslValidTo).toISOString())
      : '',
    day(f.domainExpiry),
    esc(f.registrar ?? ''),
    f.copyrightYear ?? '',
    yn(f.contentChanged),
    day(f.lastPublished),
    f.repo ?? '',
    day(f.lastPush),
    yn(f.archived),
    f.discordMembers ?? '',
    day(f.telegramLastPost),
    f.tvl != null ? Math.round(f.tvl) : '',
    f.tvlChange7d != null ? f.tvlChange7d.toFixed(1) : '',
    positive ? `+${positive}` : '',
    negative || '',
    esc(evidenceDetails(evList)),
  ]
}

/**
 * Builds and downloads the detailed CSV export (one row per project, full
 * evidence audit trail included) for the current results.
 * @param {import('../shared/domain/projects.js').Project[]} projects
 * @param {Record<string, {score?: number, verdict?: string, facts?: object, evidence?: Array}>} deep
 */
export function downloadCsv(projects, deep) {
  const rows = projects.map((p) => projectRow(p, deep))
  const scoringNote = `# Score = 50 base + sum of evidence points, clamped 0-100. Verdicts: >=75 Active, 60-74 Likely Active, 40-59 Unclear, 25-39 Likely Dead, <25 Dead. Generated ${new Date().toISOString()}`
  const csv = [scoringNote, HEADERS.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ecosystem-status.csv'
  a.click()
  URL.revokeObjectURL(url)
}
