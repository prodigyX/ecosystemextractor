import { useCallback, useState } from 'react'
import { runWithConcurrency } from './concurrency.js'
import { checkWebsite, checkXProfile } from './quickCheckService.js'

const CONCURRENCY = 5

/**
 * Runs the client-side "quick check": a fetch-based alive/dead probe of every
 * project's website and X profile, with bounded concurrency. Each fetch has
 * its own timeout/AbortController, so no cleanup is needed at the hook level —
 * `startCheck` is only ever triggered from a button click, not an Effect.
 *
 * @param {import('../../shared/domain/projects.js').Project[]} projects current project list
 * @param {(updater: (prev: import('../../shared/domain/projects.js').Project[]) => import('../../shared/domain/projects.js').Project[]) => void} setProjects
 */
export function useQuickCheck(projects, setProjects) {
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

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
    const total = projects.reduce((n, p) => n + (p.website ? 1 : 0) + (p.x ? 1 : 0), 0)
    setProgress({ done: 0, total })

    const tasks = []
    for (const p of projects) {
      if (p.website) {
        tasks.push(async () => {
          const result = await checkWebsite(p.website)
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
  }, [checking, projects, setProjects])

  const reset = useCallback(() => {
    setChecking(false)
    setProgress({ done: 0, total: 0 })
  }, [])

  return { checking, progress, startCheck, reset }
}
