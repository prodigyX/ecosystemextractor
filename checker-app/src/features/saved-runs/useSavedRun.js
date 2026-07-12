import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSavedHistoryMeta, saveRunSnapshot, fetchSavedRun } from './savedRunsService.js'

const MAX_SAVED_RUNS = 10

/**
 * Owns a rolling server-side (Postgres-backed) history of completed runs:
 * auto-saves once a quick check or deep check finishes and exposes ways to
 * restore the newest or a specifically selected historical snapshot. This
 * is durable and shared across every browser/device hitting the deployment
 * — unlike the in-memory signal cache, it is not meant to reset on restart.
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
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
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

  /** Re-fetches the history list from the server — other devices/browsers may have saved runs since the last fetch. */
  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await fetchSavedHistoryMeta())
    } catch {
      // Most likely no database is linked yet — history just stays empty.
    }
  }, [])

  // Inlined rather than calling refreshHistory() directly, so the effect
  // itself doesn't reference a function whose body sets state — the fetch
  // is still async (the .then callback is what actually calls setHistory),
  // this just keeps the effect's own body free of a direct setState call.
  // historyLoading covers only this initial mount fetch — the Dropzone
  // shows a loader while it's true, so a brand-new page load doesn't look
  // like "no history exists" during the brief window before this resolves.
  useEffect(() => {
    let cancelled = false
    fetchSavedHistoryMeta()
      .then((data) => {
        if (!cancelled) setHistory(data)
      })
      .catch(() => {
        // Most likely no database is linked yet — history just stays empty.
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveRun = useCallback(async (checkType) => {
    if (!projectsRef.current.length) return
    try {
      const saved = await saveRunSnapshot({
        fileName: fileNameRef.current,
        projects: projectsRef.current,
        deep: deepRef.current,
        checkType,
      })
      setHistory((prev) => [
        { id: saved.id, savedAt: saved.savedAt, fileName: saved.fileName, count: saved.count, checkType: saved.checkType },
        ...prev,
      ].slice(0, MAX_SAVED_RUNS))
      setLoadedAt(saved.savedAt)
    } catch {
      /* Server unavailable or no database linked yet — non-fatal */
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
   * @returns {Promise<{status: 'empty'} | {status: 'error'} | {status: 'ok', saved: import('./savedRunsService.js').SavedRunSnapshot}>}
   */
  const loadRun = useCallback(async (id = null) => {
    try {
      const saved = await fetchSavedRun(id)
      if (!saved) return { status: 'empty' }
      setLoadedAt(saved.savedAt)
      return { status: 'ok', saved }
    } catch {
      return { status: 'error' }
    }
  }, [])

  const loadLastRun = useCallback(() => loadRun(), [loadRun])

  const clearLoadedAt = useCallback(() => {
    quickSavePending.current = false
    deepSavePending.current = false
    setLoadedAt(null)
  }, [])

  return { history, historyLoading, savedMeta, loadedAt, loadRun, loadLastRun, clearLoadedAt, refreshHistory }
}
