import { useCallback, useEffect, useRef, useState } from 'react'
import { readSavedMeta, saveSnapshot, loadSnapshot, clearSnapshot } from './savedRunsService.js'

/**
 * Owns persistence of the "last completed run" to localStorage: auto-saves once
 * a quick check or deep check finishes with a complete result, and exposes a
 * way to restore the saved snapshot.
 *
 * Auto-save is triggered by watching `checking`/`deepRunning` transition from
 * true to false (i.e. a check that was actually running just finished) AND the
 * corresponding `quickDone`/`deepDone` flag being true at that moment. This
 * distinguishes "a check I ran just completed" from "the saved run was just
 * restored" (which sets `quickDone`/`deepDone` true without ever flipping
 * `checking`/`deepRunning`) and from "the check failed" (which flips
 * `checking`/`deepRunning` back to false without `quickDone`/`deepDone` ever
 * becoming true) — without needing a manually set/cleared "did I just run"
 * flag threaded through the check-starting functions.
 *
 * @param {{
 *   projects: import('../../shared/domain/projects.js').Project[],
 *   deep: Record<string, unknown>,
 *   fileName: string|null,
 *   checking: boolean,
 *   deepRunning: boolean,
 *   quickDone: boolean,
 *   deepDone: boolean,
 * }} state
 */
export function useSavedRun({ projects, deep, fileName, checking, deepRunning, quickDone, deepDone }) {
  const [savedMeta, setSavedMeta] = useState(() => readSavedMeta())
  const [loadedAt, setLoadedAt] = useState(null)

  // Refs mirror the latest values so saveRun always captures the final results,
  // without saveRun needing to change identity (and re-run the effect below)
  // every time projects/deep/fileName change mid-run. Synced in an Effect
  // (not during render) so a ref write is never observed while rendering.
  const projectsRef = useRef(projects)
  const deepRef = useRef(deep)
  const fileNameRef = useRef(fileName)
  useEffect(() => {
    projectsRef.current = projects
    deepRef.current = deep
    fileNameRef.current = fileName
  })

  const saveRun = useCallback(() => {
    if (!projectsRef.current.length) return
    try {
      const snapshot = saveSnapshot({
        fileName: fileNameRef.current,
        projects: projectsRef.current,
        deep: deepRef.current,
      })
      setSavedMeta({ savedAt: snapshot.savedAt, fileName: snapshot.fileName, count: snapshot.projects.length })
      setLoadedAt(snapshot.savedAt)
    } catch {
      /* localStorage full or unavailable — non-fatal */
    }
  }, [])

  const prevChecking = useRef(checking)
  const prevDeepRunning = useRef(deepRunning)
  useEffect(() => {
    const quickJustFinished = prevChecking.current && !checking
    const deepJustFinished = prevDeepRunning.current && !deepRunning
    prevChecking.current = checking
    prevDeepRunning.current = deepRunning
    if ((quickJustFinished && quickDone) || (deepJustFinished && deepDone)) {
      saveRun()
    }
  }, [checking, deepRunning, quickDone, deepDone, saveRun])

  /**
   * @returns {{status: 'empty'} | {status: 'error'} | {status: 'ok', saved: import('./savedRunsService.js').SavedRunSnapshot}}
   */
  const loadLastRun = useCallback(() => {
    try {
      const saved = loadSnapshot()
      if (!saved) return { status: 'empty' }
      setLoadedAt(saved.savedAt)
      return { status: 'ok', saved }
    } catch {
      clearSnapshot()
      setSavedMeta(null)
      return { status: 'error' }
    }
  }, [])

  const clearLoadedAt = useCallback(() => setLoadedAt(null), [])

  return { savedMeta, loadedAt, loadLastRun, clearLoadedAt }
}
