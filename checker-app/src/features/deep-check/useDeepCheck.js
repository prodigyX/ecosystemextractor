import { useCallback, useRef, useState } from 'react'
import { runDeepCheckStream } from './deepCheckService.js'

// Must match the number of signal checks run per project in server/pipeline.js
// (website, dns-ssl, domain, defillama, x, content, sitemap, github, discord, telegram).
const TOTAL_SIGNALS = 10
const ACTIVITY_LOG_LIMIT = 300

/**
 * Runs the server-side "deep check" pipeline for every project via
 * deepCheckService's streamed events. Each `project-done` event carries that
 * project's score, verdict, facts, and full evidence trail, and also updates
 * the quick-check-style website/X status columns so the two views stay
 * consistent.
 *
 * Also consumes the `signal` events the pipeline emits as each of a project's
 * ~10 individual checks completes (previously discarded) to derive live
 * per-project progress percentages and a running activity log, for the
 * batch-progress panel.
 *
 * @param {import('../../shared/domain/projects.js').Project[]} projects current project list
 * @param {(updater: (prev: import('../../shared/domain/projects.js').Project[]) => import('../../shared/domain/projects.js').Project[]) => void} setProjects
 * @param {{onStart?: () => void, onError?: (message: string) => void}} [options]
 */
export function useDeepCheck(projects, setProjects, { onStart, onError } = {}) {
  const [deep, setDeep] = useState({}) // projectId -> {status, score, verdict, facts, evidence}
  const [deepRunning, setDeepRunning] = useState(false)
  const [deepProgress, setDeepProgress] = useState({ done: 0, total: 0 })
  const [signalProgress, setSignalProgress] = useState({}) // projectId -> completed signal count
  const [activityLog, setActivityLog] = useState([]) // newest first
  const [startedAt, setStartedAt] = useState(null)
  const projectNamesRef = useRef({})

  const startDeepCheck = useCallback(async () => {
    if (deepRunning || projects.length === 0) return
    onStart?.()
    setDeepRunning(true)
    setStartedAt(Date.now())
    setActivityLog([])
    projectNamesRef.current = Object.fromEntries(projects.map((p) => [p.id, p.name]))

    const initial = {}
    for (const p of projects) initial[p.id] = { status: 'checking', evidence: [] }
    setDeep(initial)
    setDeepProgress({ done: 0, total: projects.length })
    setSignalProgress(Object.fromEntries(projects.map((p) => [p.id, 0])))

    let done = 0
    const handleEvent = (event) => {
      if (event.type === 'signal') {
        setSignalProgress((prev) => ({
          ...prev,
          [event.projectId]: (prev[event.projectId] ?? 0) + 1,
        }))
        if (event.evidence?.length) {
          const projectName = projectNamesRef.current[event.projectId] ?? event.projectId
          const ts = Date.now()
          const entries = event.evidence.map((e) => ({
            projectId: event.projectId,
            projectName,
            signal: e.signal,
            level: e.level,
            label: e.label,
            ts,
          }))
          setActivityLog((prev) => [...entries.reverse(), ...prev].slice(0, ACTIVITY_LOG_LIMIT))
        }
        return
      }

      if (event.type !== 'project-done') return
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
          history: event.history ?? [],
          checkedAt: new Date().toISOString(),
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

    try {
      await runDeepCheckStream(
        projects.map((p) => ({ id: p.id, name: p.name, website: p.website, x: p.x })),
        handleEvent
      )
    } catch (err) {
      onError?.(`Deep check failed: ${err.message}`)
    } finally {
      setDeepRunning(false)
    }
  }, [deepRunning, projects, setProjects, onStart, onError])

  const reset = useCallback(() => {
    setDeep({})
    setSignalProgress({})
    setActivityLog([])
    setStartedAt(null)
  }, [])

  return {
    deep,
    setDeep,
    deepRunning,
    deepProgress,
    signalProgress,
    activityLog,
    startedAt,
    totalSignals: TOTAL_SIGNALS,
    startDeepCheck,
    reset,
  }
}
