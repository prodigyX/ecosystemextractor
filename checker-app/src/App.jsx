import { useState, useCallback, useRef } from 'react'
import './App.css'

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

// X/Twitter blocks cross-origin requests, so we route through Vite's dev proxy
// (/x-proxy → https://x.com) to get real HTTP status codes per profile.
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

function downloadCsv(projects) {
  const headers = ['Name', 'Website', 'Website Status', 'X (Twitter)', 'X Status', 'Overall']
  const overallLabels = {
    'both-alive': 'Alive',
    'web-only': 'Maybe',
    'x-only': 'Possibly Dead',
    'both-dead': 'Dead',
    checking: 'Checking',
    idle: '',
    'not-found': 'Not Found',
  }
  const rows = projects.map((p) => [
    `"${p.name.replace(/"/g, '""')}"`,
    p.website ?? '',
    p.websiteStatus,
    p.x ?? '',
    p.xStatus,
    overallLabels[overallStatus(p.websiteStatus, p.xStatus)] ?? '',
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
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
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileInputRef = useRef(null)

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

  const startCheck = useCallback(async () => {
    if (checking || projects.length === 0) return
    setChecking(true)

    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        websiteStatus: p.website ? 'checking' : 'skip',
        xStatus: p.x ? 'checking' : 'skip',
      }))
    )

    let done = 0
    const total = projects.reduce(
      (n, p) => n + (p.website ? 1 : 0) + (p.x ? 1 : 0),
      0
    )
    setProgress({ done: 0, total })

    const tasks = []

    for (const p of projects) {
      if (p.website) {
        tasks.push(async () => {
          const result = await checkUrl(p.website)
          setProjects((prev) =>
            prev.map((r) => (r.id === p.id ? { ...r, websiteStatus: result } : r))
          )
          setProgress({ done: ++done, total })
        })
      }
      if (p.x) {
        tasks.push(async () => {
          const result = await checkXProfile(p.x)
          setProjects((prev) =>
            prev.map((r) => (r.id === p.id ? { ...r, xStatus: result } : r))
          )
          setProgress({ done: ++done, total })
        })
      }
    }

    await runWithConcurrency(tasks, CONCURRENCY)
    setChecking(false)
  }, [checking, projects])

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Ecosystem Checker</h1>
          {fileName && (
            <span className="subtitle">{fileName} · {projects.length} projects</span>
          )}
        </div>
        <div className="header-right">
          {checking && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="progress-label">{progress.done}/{progress.total}</span>
            </div>
          )}
          <button
            className="btn btn-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={checking}
          >
            Upload JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={onFileInput}
          />
          <button
            className="btn btn-primary"
            onClick={startCheck}
            disabled={checking || projects.length === 0}
          >
            {checking ? 'Checking…' : 'Check All'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => downloadCsv(projects)}
            disabled={projects.length === 0}
          >
            Download CSV
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div
          className={`dropzone`}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dropzone-icon">↑</div>
          <p className="dropzone-title">Drop your extract JSON here</p>
          <p className="dropzone-sub">or click to browse</p>
          {parseError && <p className="dropzone-error">{parseError}</p>}
        </div>
      ) : (
        <>
          {parseError && <p className="parse-error">{parseError}</p>}
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
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => (
                  <tr key={p.id} data-ws={p.websiteStatus}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
