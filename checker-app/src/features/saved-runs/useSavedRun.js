import { useCallback, useEffect, useRef, useState } from 'react'
import { readSavedHistoryMeta, saveSnapshot, loadSnapshot, clearSnapshot } from './savedRunsService.js'

/**
 * Owns a rolling localStorage history of completed runs: auto-saves once a
 * quick check or deep check finishes and exposes ways to restore the newest or
 * a specifically selected historical snapshot.
 *
 * Auto-save arms when `checking`/`deepRunning` becomes true, then waits until
 * the corresponding completed state is visible. Keeping that pending state
 * across renders handles React updates where the running flag settles just
 * before the final project result. Restoring a snapshot does not arm a save,
 * so loading history cannot create duplicate records.
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
  const [history, setHistory] = useState(() => readSavedHistoryMeta())
  const [loadedAt, setLoadedAt] = useState(null)
  const savedMeta = history[0] ?? null

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

  const saveRun = useCallback((checkType) => {
    if (!projectsRef.current.length) return
    try {
      const snapshot = saveSnapshot({
        fileName: fileNameRef.current,
        projects: projectsRef.current,
        deep: deepRef.current,
        checkType,
      })
      setHistory(readSavedHistoryMeta())
      setLoadedAt(snapshot.savedAt)
    } catch {
      /* localStorage full or unavailable — non-fatal */
    }
  }, [])

  // Completion state updates can land one render after the running flag turns
  // false. Keep each run armed until its final results are actually visible.
  const quickSavePending = useRef(false)
  const deepSavePending = useRef(false)
  useEffect(() => {
    if (checking) quickSavePending.current = true
    if (deepRunning) deepSavePending.current = true

    if (deepSavePending.current && !deepRunning && deepDone) {
      deepSavePending.current = false
      saveRun('deep')
    } else if (quickSavePending.current && !checking && quickDone) {
      quickSavePending.current = false
      saveRun('quick')
    }
  }, [checking, deepRunning, quickDone, deepDone, saveRun])

  /**
   * @returns {{status: 'empty'} | {status: 'error'} | {status: 'ok', saved: import('./savedRunsService.js').SavedRunSnapshot}}
   */
  const loadRun = useCallback((id = null) => {
    try {
      const saved = loadSnapshot(id)
      if (!saved) return { status: 'empty' }
      setLoadedAt(saved.savedAt)
      return { status: 'ok', saved }
    } catch {
      clearSnapshot()
      setHistory([])
      return { status: 'error' }
    }
  }, [])

  const loadLastRun = useCallback(() => loadRun(), [loadRun])

  const clearLoadedAt = useCallback(() => {
    quickSavePending.current = false
    deepSavePending.current = false
    setLoadedAt(null)
  }, [])

  return { history, savedMeta, loadedAt, loadRun, loadLastRun, clearLoadedAt }
}
