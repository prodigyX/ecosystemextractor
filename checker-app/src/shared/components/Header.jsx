import { fmtSavedAt } from '../lib/formatters.js'

/**
 * @param {{
 *   fileName: string|null,
 *   projectsCount: number,
 *   loadedAt: string|null,
 *   checking: boolean,
 *   deepRunning: boolean,
 *   progress: {done: number, total: number},
 *   deepProgress: {done: number, total: number},
 *   savedMeta: import('../../features/saved-runs/savedRunsService.js').SavedRunMeta|null,
 *   historyCount: number,
 *   onLoadLastRun: () => void,
 *   onOpenHistory: () => void,
 *   onFetchFromBerachain: () => void,
 *   onUseLastProjectList: () => void,
 *   fileInputRef: {current: HTMLInputElement|null},
 *   onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void,
 *   onRunNewCheck: () => void,
 *   onDownloadCsv: () => void,
 *   onDownloadJson: () => void,
 *   onClearCache: () => void,
 *   hasCheckResults: boolean,
 *   busy: boolean,
 * }} props
 */
export function Header({
  fileName,
  projectsCount,
  loadedAt,
  checking,
  deepRunning,
  progress,
  deepProgress,
  savedMeta,
  historyCount,
  onLoadLastRun,
  onOpenHistory,
  onFetchFromBerachain,
  onUseLastProjectList,
  fileInputRef,
  onFileInput,
  onRunNewCheck,
  onDownloadCsv,
  onDownloadJson,
  onClearCache,
  hasCheckResults,
  busy,
}) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const deepPct = deepProgress.total ? Math.round((deepProgress.done / deepProgress.total) * 100) : 0
  const hasProjects = projectsCount > 0

  const runDataMenuAction = (event, action) => {
    event.currentTarget.closest('details')?.removeAttribute('open')
    action()
  }

  return (
    <header className="header">
      <div className="header-left">
        <img src="/favicon.svg" alt="" className="header-logo" />
        <div>
          <h1>Ecosystem Checker</h1>
          {fileName && (
            <span className="subtitle">
              {fileName} · {projectsCount} projects
              {loadedAt && ` · results from ${fmtSavedAt(loadedAt)}`}
            </span>
          )}
        </div>
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onFileInput}
        />
        {hasProjects && hasCheckResults && (
          <button className="btn btn-primary" onClick={onRunNewCheck} disabled={busy}>
            <span aria-hidden="true">＋</span> Run a new check
          </button>
        )}
        {hasProjects && hasCheckResults && (
          <button className="btn btn-secondary" onClick={onDownloadCsv} disabled={busy}>
            <span aria-hidden="true">↓</span> Export CSV
          </button>
        )}
        {hasProjects && hasCheckResults && (
          <button className="btn btn-secondary" onClick={onDownloadJson} disabled={busy}>
            <span aria-hidden="true">↓</span> Export JSON
          </button>
        )}
        {hasProjects && (
          <details className={`header-data-menu ${busy ? 'header-data-menu-disabled' : ''}`}>
            <summary
              className="btn btn-secondary"
              aria-label="Open data source actions"
              aria-disabled={busy}
              onClick={(event) => { if (busy) event.preventDefault() }}
            >
              <span>Data</span><span className="header-data-chevron" aria-hidden="true" />
            </summary>
            <div className="header-data-popover">
              <button
                type="button"
                onClick={(event) => runDataMenuAction(event, onFetchFromBerachain)}
                disabled={busy}
              >
                <span aria-hidden="true">◎</span>
                <span><strong>Fetch latest</strong><small>From Berachain</small></span>
              </button>
              {savedMeta && (
                <button
                  type="button"
                  onClick={(event) => runDataMenuAction(event, onUseLastProjectList)}
                  disabled={busy}
                >
                  <span aria-hidden="true">⚡</span>
                  <span><strong>Use last project list</strong><small>Skip the fetch · {savedMeta.count} projects</small></span>
                </button>
              )}
              <button
                type="button"
                onClick={(event) => runDataMenuAction(event, () => fileInputRef.current?.click())}
                disabled={busy}
              >
                <span aria-hidden="true">↑</span>
                <span><strong>Upload JSON</strong><small>Replace current data</small></span>
              </button>
              {savedMeta && (
                <button
                  type="button"
                  onClick={(event) => runDataMenuAction(event, onLoadLastRun)}
                  disabled={busy || Boolean(loadedAt && loadedAt >= savedMeta.savedAt)}
                >
                  <span aria-hidden="true">↶</span>
                  <span><strong>Restore last run</strong><small>{fmtSavedAt(savedMeta.savedAt)} · {savedMeta.count} projects</small></span>
                </button>
              )}
              {historyCount > 0 && (
                <button
                  type="button"
                  onClick={(event) => runDataMenuAction(event, onOpenHistory)}
                  disabled={busy}
                >
                  <span aria-hidden="true">☰</span>
                  <span><strong>Select from history</strong><small>{historyCount} saved {historyCount === 1 ? 'run' : 'runs'}</small></span>
                </button>
              )}
              <button
                type="button"
                onClick={(event) => runDataMenuAction(event, onClearCache)}
                disabled={busy}
              >
                <span aria-hidden="true">⟲</span>
                <span><strong>Clear check cache</strong><small>Fresh X/GitHub lookups + deletes saved run history</small></span>
              </button>
            </div>
          </details>
        )}
      </div>
    </header>
  )
}
