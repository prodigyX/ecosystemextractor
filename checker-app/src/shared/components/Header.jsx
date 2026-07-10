import { fmtSavedAt } from '../lib/formatters.js'

/**
 * @param {{
 *   fileName: string|null,
 *   projectsCount: number,
 *   loadedAt: string|null,
 *   checking: boolean,
 *   deepRunning: boolean,
 *   fetching: boolean,
 *   progress: {done: number, total: number},
 *   deepProgress: {done: number, total: number},
 *   savedMeta: import('../../features/saved-runs/savedRunsService.js').SavedRunMeta|null,
 *   onLoadLastRun: () => void,
 *   onFetchFromBerachain: () => void,
 *   fileInputRef: {current: HTMLInputElement|null},
 *   onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void,
 *   onStartCheck: () => void,
 *   onStartDeepCheck: () => void,
 *   onDownloadCsv: () => void,
 *   busy: boolean,
 * }} props
 */
export function Header({
  fileName,
  projectsCount,
  loadedAt,
  checking,
  deepRunning,
  fetching,
  progress,
  deepProgress,
  savedMeta,
  onLoadLastRun,
  onFetchFromBerachain,
  fileInputRef,
  onFileInput,
  onStartCheck,
  onStartDeepCheck,
  onDownloadCsv,
  busy,
}) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const deepPct = deepProgress.total ? Math.round((deepProgress.done / deepProgress.total) * 100) : 0

  return (
    <header className="header">
      <div className="header-left">
        <h1>Ecosystem Checker</h1>
        {fileName && (
          <span className="subtitle">
            {fileName} · {projectsCount} projects
            {loadedAt && ` · results from ${fmtSavedAt(loadedAt)}`}
          </span>
        )}
      </div>
      <div className="header-right">
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
            onClick={onLoadLastRun}
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
        <button className="btn btn-fetch" onClick={onFetchFromBerachain} disabled={busy}>
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
        <button className="btn btn-secondary" onClick={onStartCheck} disabled={busy || projectsCount === 0}>
          {checking ? 'Checking…' : 'Quick Check'}
        </button>
        <button className="btn btn-primary" onClick={onStartDeepCheck} disabled={busy || projectsCount === 0}>
          {deepRunning ? 'Deep Checking…' : 'Deep Check'}
        </button>
        <button className="btn btn-secondary" onClick={onDownloadCsv} disabled={projectsCount === 0}>
          Download CSV
        </button>
      </div>
    </header>
  )
}
