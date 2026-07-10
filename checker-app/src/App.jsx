import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

const STORAGE_KEY = 'ecosystem-checker:last-run'

function readSavedMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved?.savedAt || !Array.isArray(saved.projects)) return null
    return { savedAt: saved.savedAt, fileName: saved.fileName, count: saved.projects.length }
  } catch {
    return null
  }
}

function fmtSavedAt(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const CONCURRENCY = 5
const TIMEOUT_MS = 10000

function extractProjects(data) {
  return data.map((item) => {
    const twitter = item.socials?.find((s) => s.platform === 'twitter')
    return {
      id: item.id ?? crypto.randomUUID(),
      name: item.name,
      website: item.external_url || null,
      x: twitter?.url || null,
      websiteStatus: 'idle',
      xStatus: 'idle',
    }
  })
}

async function checkUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal })
    return 'alive'
  } catch {
    return 'dead'
  } finally {
    clearTimeout(timer)
  }
}

function xHandleFromUrl(url) {
  return url
    .replace('https://x.com/', '')
    .replace('https://twitter.com/', '')
    .replace(/^@/, '')
    .split('/')[0]
    .split('?')[0]
}

async function checkXProfile(xUrl) {
  const handle = xHandleFromUrl(xUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`/x-proxy/${handle}`, { signal: controller.signal })
    return res.ok ? 'alive' : 'not-found'
  } catch {
    return 'dead'
  } finally {
    clearTimeout(timer)
  }
}

async function runWithConcurrency(tasks, concurrency) {
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

function StatusBadge({ status }) {
  const map = {
    idle: ['idle', '—'],
    checking: ['checking', 'Checking…'],
    alive: ['alive', 'Alive'],
    dead: ['dead', 'Dead'],
    'not-found': ['not-found', 'Not Found'],
    skip: ['skip', 'No URL'],
  }
  const [cls, label] = map[status] ?? ['idle', '—']
  return <span className={`badge ${cls}`}>{label}</span>
}

const VERDICTS = {
  active: ['alive', 'Active'],
  'likely-active': ['likely-active', 'Likely Active'],
  unclear: ['maybe', 'Unclear'],
  'likely-dead': ['not-found', 'Likely Dead'],
  dead: ['dead', 'Dead'],
  error: ['dead', 'Error'],
  checking: ['checking', 'Checking…'],
}

function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="badge idle">—</span>
  const [cls, label] = VERDICTS[verdict] ?? ['idle', verdict]
  return <span className={`badge ${cls}`}>{label}</span>
}

function isAlive(s) { return s === 'alive' }
function isDone(s) { return s !== 'idle' && s !== 'checking' }

function overallStatus(ws, xs) {
  if (!isDone(ws) || !isDone(xs)) {
    if (ws === 'idle' || xs === 'idle') return 'idle'
    return 'checking'
  }
  const webAlive = isAlive(ws)
  const xAlive = isAlive(xs)
  if (webAlive && xAlive) return 'both-alive'
  if (webAlive && !xAlive) return 'web-only'
  if (!webAlive && xAlive) return 'x-only'
  return 'both-dead'
}

function OverallBadge({ ws, xs }) {
  const status = overallStatus(ws, xs)
  const map = {
    idle: ['idle', '—'],
    checking: ['checking', 'Checking…'],
    'both-alive': ['alive', 'Alive'],
    'web-only': ['maybe', 'Maybe'],
    'x-only': ['possibly-dead', 'Possibly Dead'],
    'both-dead': ['dead', 'Dead'],
  }
  const [cls, label] = map[status] ?? ['idle', '—']
  return <span className={`badge ${cls}`}>{label}</span>
}

const EVIDENCE_ICON = { good: '●', warn: '●', bad: '●', info: '○' }

function downloadCsv(projects, deep) {
  const headers = [
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
  const overallLabels = {
    'both-alive': 'Alive', 'web-only': 'Maybe', 'x-only': 'Possibly Dead',
    'both-dead': 'Dead', checking: 'Checking', idle: '',
  }
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '')
  const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : '')

  const rows = projects.map((p) => {
    const d = deep[p.id]
    const f = d?.facts ?? {}
    const evList = d?.evidence ?? []
    const positive = evList.reduce((n, e) => n + (e.delta > 0 ? e.delta : 0), 0)
    const negative = evList.reduce((n, e) => n + (e.delta < 0 ? e.delta : 0), 0)
    // Full audit trail: every evidence item with signal, level, detail, and points
    const details = evList
      .map((e) => {
        const pts = e.delta ? ` (${e.delta > 0 ? '+' : ''}${e.delta})` : ''
        const det = e.detail ? ` — ${e.detail}` : ''
        return `[${e.signal}] ${e.level.toUpperCase()}: ${e.label}${det}${pts}`
      })
      .join('\n')

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
      overallLabels[overallStatus(p.websiteStatus, p.xStatus)] ?? '',
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
      esc(details),
    ]
  })
  const scoringNote = `# Score = 50 base + sum of evidence points, clamped 0-100. Verdicts: >=75 Active, 60-74 Likely Active, 40-59 Unclear, 25-39 Likely Dead, <25 Dead. Generated ${new Date().toISOString()}`
  const csv = [scoringNote, headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ecosystem-status.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [fileName, setFileName] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [checking, setChecking] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [light, setLight] = useState(false)
  const [deep, setDeep] = useState({}) // projectId -> {status, score, verdict, facts, evidence}
  const [deepRunning, setDeepRunning] = useState(false)
  const [deepProgress, setDeepProgress] = useState({ done: 0, total: 0 })
  const [expanded, setExpanded] = useState(new Set())
  const [savedMeta, setSavedMeta] = useState(() => readSavedMeta())
  const [loadedAt, setLoadedAt] = useState(null) // when current results were produced
  const fileInputRef = useRef(null)
  const ranThisSession = useRef(false)

  // Refs mirror latest state so saveRun always captures the final results
  const projectsRef = useRef(projects)
  const deepRef = useRef(deep)
  const fileNameRef = useRef(fileName)
  projectsRef.current = projects
  deepRef.current = deep
  fileNameRef.current = fileName

  const saveRun = useCallback(() => {
    if (!projectsRef.current.length) return
    const snapshot = {
      savedAt: new Date().toISOString(),
      fileName: fileNameRef.current,
      projects: projectsRef.current,
      deep: deepRef.current,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      setSavedMeta({ savedAt: snapshot.savedAt, fileName: snapshot.fileName, count: snapshot.projects.length })
      setLoadedAt(snapshot.savedAt)
    } catch {
      /* localStorage full or unavailable — non-fatal */
    }
  }, [])

  const loadLastRun = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!Array.isArray(saved.projects)) throw new Error('bad snapshot')
      setProjects(saved.projects)
      setDeep(saved.deep ?? {})
      setFileName(saved.fileName ?? 'saved run')
      setLoadedAt(saved.savedAt)
      setExpanded(new Set())
      setParseError(null)
      setChecking(false)
      setProgress({ done: 0, total: 0 })
      ranThisSession.current = false
    } catch {
      setParseError('Saved run is corrupted — could not load it.')
      localStorage.removeItem(STORAGE_KEY)
      setSavedMeta(null)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setLight((prev) => {
      document.body.classList.toggle('light', !prev)
      return !prev
    })
  }, [])

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleFile = useCallback((file) => {
    if (!file) return
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)
        const arr = Array.isArray(json) ? json : [json]
        setProjects(extractProjects(arr))
        setFileName(file.name)
        setChecking(false)
        setProgress({ done: 0, total: 0 })
        setDeep({})
        setExpanded(new Set())
      } catch {
        setParseError('Invalid JSON — could not parse the file.')
      }
    }
    reader.readAsText(file)
  }, [])

  const onFileInput = (e) => handleFile(e.target.files[0])

  const onDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const fetchFromBerachain = useCallback(async () => {
    if (fetching || checking || deepRunning) return
    setFetching(true)
    setParseError(null)
    try {
      const res = await fetch('/api/extract')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Extraction failed')
      const arr = Array.isArray(json) ? json : [json]
      setProjects(extractProjects(arr))
      setFileName('explore.berachain.com (live)')
      setChecking(false)
      setProgress({ done: 0, total: 0 })
      setDeep({})
      setExpanded(new Set())
    } catch (err) {
      setParseError(`Fetch failed: ${err.message}`)
    } finally {
      setFetching(false)
    }
  }, [fetching, checking, deepRunning])

  const startCheck = useCallback(async () => {
    if (checking || deepRunning || projects.length === 0) return
    ranThisSession.current = true
    setChecking(true)

    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        websiteStatus: p.website ? 'checking' : 'skip',
        xStatus: p.x ? 'checking' : 'skip',
      }))
    )

    let done = 0
    const total = projects.reduce((n, p) => n + (p.website ? 1 : 0) + (p.x ? 1 : 0), 0)
    setProgress({ done: 0, total })

    const tasks = []
    for (const p of projects) {
      if (p.website) {
        tasks.push(async () => {
          const result = await checkUrl(p.website)
          setProjects((prev) => prev.map((r) => (r.id === p.id ? { ...r, websiteStatus: result } : r)))
          setProgress({ done: ++done, total })
        })
      }
      if (p.x) {
        tasks.push(async () => {
          const result = await checkXProfile(p.x)
          setProjects((prev) => prev.map((r) => (r.id === p.id ? { ...r, xStatus: result } : r)))
          setProgress({ done: ++done, total })
        })
      }
    }

    await runWithConcurrency(tasks, CONCURRENCY)
    setChecking(false)
  }, [checking, deepRunning, projects])

  const startDeepCheck = useCallback(async () => {
    if (deepRunning || checking || projects.length === 0) return
    ranThisSession.current = true
    setDeepRunning(true)
    setParseError(null)

    const initial = {}
    for (const p of projects) initial[p.id] = { status: 'checking', evidence: [] }
    setDeep(initial)
    setDeepProgress({ done: 0, total: projects.length })

    try {
      const res = await fetch('/api/deep-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: projects.map((p) => ({ id: p.id, name: p.name, website: p.website, x: p.x })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = 0

      for (;;) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          let event
          try { event = JSON.parse(line) } catch { continue }

          if (event.type === 'project-done') {
            done++
            setDeepProgress({ done, total: projects.length })
            setDeep((prev) => ({
              ...prev,
              [event.projectId]: {
                status: 'done',
                score: event.score,
                verdict: event.verdict,
                facts: event.facts,
                evidence: event.evidence,
              },
            }))
            // Sync the simple status columns from deep facts
            setProjects((prev) =>
              prev.map((p) => {
                if (p.id !== event.projectId) return p
                const httpOk = event.facts?.status >= 200 && event.facts?.status < 400
                const httpBlocked = event.facts?.status === 401 || event.facts?.status === 403
                return {
                  ...p,
                  websiteStatus: p.website ? (httpOk || httpBlocked ? 'alive' : 'dead') : 'skip',
                  xStatus: p.x
                    ? event.facts?.xExists === false
                      ? 'not-found'
                      : event.facts?.xExists
                        ? 'alive'
                        : p.xStatus === 'idle' ? 'idle' : p.xStatus
                    : 'skip',
                }
              })
            )
          }
        }
      }
    } catch (err) {
      setParseError(`Deep check failed: ${err.message}`)
    } finally {
      setDeepRunning(false)
    }
  }, [deepRunning, checking, projects])

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const deepPct = deepProgress.total ? Math.round((deepProgress.done / deepProgress.total) * 100) : 0

  const deepDone = projects.length > 0 && !deepRunning &&
    projects.every((p) => deep[p.id]?.status === 'done')

  const quickDone = projects.length > 0 && !checking &&
    projects.every((p) => p.websiteStatus !== 'idle' && p.websiteStatus !== 'checking')

  // Auto-save when a run this session finishes (not when restoring a saved run)
  useEffect(() => {
    if (ranThisSession.current && (deepDone || quickDone)) {
      ranThisSession.current = false
      saveRun()
    }
  }, [deepDone, quickDone, saveRun])

  const verdictCounts = deepDone ? {
    total: projects.length,
    active: projects.filter((p) => deep[p.id]?.verdict === 'active').length,
    likelyActive: projects.filter((p) => deep[p.id]?.verdict === 'likely-active').length,
    unclear: projects.filter((p) => deep[p.id]?.verdict === 'unclear').length,
    likelyDead: projects.filter((p) => deep[p.id]?.verdict === 'likely-dead').length,
    dead: projects.filter((p) => ['dead', 'error'].includes(deep[p.id]?.verdict)).length,
  } : null

  const quickCounts = !verdictCounts && quickDone ? {
    total: projects.length,
    alive: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'both-alive').length,
    maybe: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'web-only').length,
    possiblyDead: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'x-only').length,
    dead: projects.filter((p) => overallStatus(p.websiteStatus, p.xStatus) === 'both-dead').length,
  } : null

  const busy = checking || deepRunning || fetching

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Ecosystem Checker</h1>
          {fileName && (
            <span className="subtitle">
              {fileName} · {projects.length} projects
              {loadedAt && ` · results from ${fmtSavedAt(loadedAt)}`}
            </span>
          )}
        </div>
        <div className="header-right">
          <button className="btn-theme" onClick={toggleTheme} title="Toggle theme">
            {light ? '🌙' : '☀️'}
          </button>
          {(checking || deepRunning) && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${deepRunning ? deepPct : pct}%` }}
                />
              </div>
              <span className="progress-label">
                {deepRunning
                  ? `${deepProgress.done}/${deepProgress.total} projects`
                  : `${progress.done}/${progress.total}`}
              </span>
            </div>
          )}
          {savedMeta && (
            <button
              className="btn btn-secondary"
              onClick={loadLastRun}
              disabled={busy || (loadedAt && loadedAt >= savedMeta.savedAt)}
              title={
                loadedAt && loadedAt >= savedMeta.savedAt
                  ? 'Current results are already the latest'
                  : `Restore ${savedMeta.count} projects checked ${fmtSavedAt(savedMeta.savedAt)}`
              }
            >
              Load Last Run ({fmtSavedAt(savedMeta.savedAt)})
            </button>
          )}
          <button className="btn btn-fetch" onClick={fetchFromBerachain} disabled={busy}>
            {fetching ? 'Fetching…' : 'Fetch from Berachain'}
          </button>
          <button className="btn btn-upload" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Upload JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={onFileInput}
          />
          <button className="btn btn-secondary" onClick={startCheck} disabled={busy || projects.length === 0}>
            {checking ? 'Checking…' : 'Quick Check'}
          </button>
          <button className="btn btn-primary" onClick={startDeepCheck} disabled={busy || projects.length === 0}>
            {deepRunning ? 'Deep Checking…' : 'Deep Check'}
          </button>
          <button className="btn btn-secondary" onClick={() => downloadCsv(projects, deep)} disabled={projects.length === 0}>
            Download CSV
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div
          className="dropzone"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          {fetching ? (
            <>
              <div className="dropzone-icon spin">⟳</div>
              <p className="dropzone-title">Fetching from Berachain…</p>
              <p className="dropzone-sub">Launching browser, this takes ~10–20s</p>
            </>
          ) : (
            <>
              <div className="dropzone-icon">↑</div>
              <p className="dropzone-title">Drop your extract JSON here</p>
              <p className="dropzone-sub">
                or click to browse · or use{' '}
                <span
                  className="dropzone-link"
                  onClick={(e) => { e.stopPropagation(); fetchFromBerachain() }}
                >
                  Fetch from Berachain
                </span>
              </p>
              {savedMeta && (
                <p className="dropzone-sub dropzone-restore">
                  <span
                    className="dropzone-link"
                    onClick={(e) => { e.stopPropagation(); loadLastRun() }}
                  >
                    Restore last run
                  </span>
                  {' '}— {savedMeta.count} projects · {fmtSavedAt(savedMeta.savedAt)}
                </p>
              )}
            </>
          )}
          {parseError && <p className="dropzone-error">{parseError}</p>}
        </div>
      ) : (
        <>
          {parseError && <p className="parse-error">{parseError}</p>}

          {verdictCounts && (
            <div className="summary">
              <div className="summary-card total">
                <span className="summary-num">{verdictCounts.total}</span>
                <span className="summary-label">Total</span>
              </div>
              <div className="summary-card alive">
                <span className="summary-num">{verdictCounts.active}</span>
                <span className="summary-label">Active</span>
              </div>
              <div className="summary-card likely-active">
                <span className="summary-num">{verdictCounts.likelyActive}</span>
                <span className="summary-label">Likely Active</span>
              </div>
              <div className="summary-card maybe">
                <span className="summary-num">{verdictCounts.unclear}</span>
                <span className="summary-label">Unclear</span>
              </div>
              <div className="summary-card possibly-dead">
                <span className="summary-num">{verdictCounts.likelyDead}</span>
                <span className="summary-label">Likely Dead</span>
              </div>
              <div className="summary-card dead">
                <span className="summary-num">{verdictCounts.dead}</span>
                <span className="summary-label">Dead</span>
              </div>
            </div>
          )}

          {quickCounts && (
            <div className="summary">
              <div className="summary-card total">
                <span className="summary-num">{quickCounts.total}</span>
                <span className="summary-label">Total</span>
              </div>
              <div className="summary-card alive">
                <span className="summary-num">{quickCounts.alive}</span>
                <span className="summary-label">Alive</span>
              </div>
              <div className="summary-card maybe">
                <span className="summary-num">{quickCounts.maybe}</span>
                <span className="summary-label">Maybe</span>
              </div>
              <div className="summary-card possibly-dead">
                <span className="summary-num">{quickCounts.possiblyDead}</span>
                <span className="summary-label">Possibly Dead</span>
              </div>
              <div className="summary-card dead">
                <span className="summary-num">{quickCounts.dead}</span>
                <span className="summary-label">Dead</span>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>Project</th>
                  <th>Website</th>
                  <th className="col-status">Website Status</th>
                  <th>X (Twitter)</th>
                  <th className="col-status">X Status</th>
                  <th className="col-status col-overall">Overall</th>
                  <th className="col-score">Score</th>
                  <th className="col-status">Verdict</th>
                  <th className="col-expand"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const d = deep[p.id]
                  const isExpanded = expanded.has(p.id)
                  return [
                    <tr key={p.id} data-ws={p.websiteStatus} className={isExpanded ? 'row-expanded' : ''}>
                      <td className="col-num">{i + 1}</td>
                      <td className="col-name">{p.name}</td>
                      <td className="col-url">
                        {p.website ? (
                          <a href={p.website} target="_blank" rel="noopener noreferrer">
                            {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        ) : (
                          <span className="empty">—</span>
                        )}
                      </td>
                      <td className="col-status"><StatusBadge status={p.websiteStatus} /></td>
                      <td className="col-url">
                        {p.x ? (
                          <a href={p.x} target="_blank" rel="noopener noreferrer">
                            {p.x.replace('https://x.com/', '@').replace('https://twitter.com/', '@')}
                          </a>
                        ) : (
                          <span className="empty">—</span>
                        )}
                      </td>
                      <td className="col-status"><StatusBadge status={p.xStatus} /></td>
                      <td className="col-status col-overall"><OverallBadge ws={p.websiteStatus} xs={p.xStatus} /></td>
                      <td className="col-score">
                        {d?.status === 'done' ? (
                          <span className={`score score-${d.verdict}`}>{d.score}</span>
                        ) : d?.status === 'checking' ? (
                          <span className="score checking-dots">…</span>
                        ) : (
                          <span className="empty">—</span>
                        )}
                      </td>
                      <td className="col-status">
                        <VerdictBadge verdict={d?.status === 'checking' ? 'checking' : d?.verdict} />
                      </td>
                      <td className="col-expand">
                        {d?.evidence?.length > 0 && (
                          <button className="btn-expand" onClick={() => toggleExpand(p.id)}>
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                    </tr>,
                    isExpanded && d?.evidence?.length > 0 && (
                      <tr key={`${p.id}-detail`} className="detail-row">
                        <td colSpan={10}>
                          <div className="evidence-list">
                            {d.evidence.map((e, j) => (
                              <div key={j} className={`evidence-item ev-${e.level}`}>
                                <span className="ev-dot">{EVIDENCE_ICON[e.level]}</span>
                                <span className="ev-signal">{e.signal}</span>
                                <span className="ev-label">{e.label}</span>
                                {e.detail && <span className="ev-detail">{e.detail}</span>}
                                {e.delta !== 0 && (
                                  <span className={`ev-delta ${e.delta > 0 ? 'pos' : 'neg'}`}>
                                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
