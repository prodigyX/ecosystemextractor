import { useState } from 'react'
import { fmtSavedAt } from '../lib/formatters.js'

/**
 * First-stage source choice shown before any projects are loaded. Both source
 * paths are explicit buttons; JSON files can also be dropped anywhere on the
 * panel as a convenience.
 *
 * @param {{
 *   fetching: boolean,
 *   parseError: string|null,
 *   onDrop: (e: React.DragEvent) => void,
 *   onBrowseClick: () => void,
 *   onFetchFromBerachain: () => void,
 *   onUseLastProjectList: () => void,
 *   history: import('../../features/saved-runs/savedRunsService.js').SavedRunMeta[],
 *   onLoadHistory: (id: string) => void,
 * }} props
 */
export function Dropzone({
  fetching,
  parseError,
  onDrop,
  onBrowseClick,
  onFetchFromBerachain,
  onUseLastProjectList,
  history,
  onLoadHistory,
}) {
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <section
      className={`source-gate ${fetching ? 'source-gate-fetching' : ''}`}
      aria-labelledby="source-gate-title"
      aria-busy={fetching}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="source-gate-heading">
        <span className="flow-step">Step 1 of 2</span>
        <h2 id="source-gate-title">Choose your project data source</h2>
        <p>Start with live data, provide a JSON extract, or continue from a previous check.</p>
      </div>

      <div className="source-options">
        <button
          type="button"
          className="source-option source-option-fetch"
          onClick={onFetchFromBerachain}
          disabled={fetching}
        >
          <span className="source-option-icon" aria-hidden="true">
            {fetching ? <span className="spinner-ring" /> : '◎'}
          </span>
          <span className="source-option-copy">
            <span className="source-option-label" aria-live="polite">
              {fetching ? 'Fetching from Berachain…' : 'Fetch from Berachain'}
            </span>
            <span className="source-option-description">
              {fetching
                ? 'Opening the ecosystem directory. This usually takes 10–20 seconds.'
                : 'Load the latest projects directly from explore.berachain.com.'}
            </span>
          </span>
          {!fetching && <span className="source-option-arrow" aria-hidden="true">→</span>}
        </button>

        {history.length > 0 && (
          <button
            type="button"
            className="source-option source-option-reuse"
            onClick={onUseLastProjectList}
            disabled={fetching}
          >
            <span className="source-option-icon" aria-hidden="true">⚡</span>
            <span className="source-option-copy">
              <span className="source-option-label">Use last project list</span>
              <span className="source-option-description">
                Skip the live fetch — reuse the {history[0].count}-project list from {fmtSavedAt(history[0].savedAt)}, run a fresh check.
              </span>
            </span>
            <span className="source-option-arrow" aria-hidden="true">→</span>
          </button>
        )}

        <button
          type="button"
          className="source-option source-option-upload"
          onClick={onBrowseClick}
          disabled={fetching}
        >
          <span className="source-option-icon" aria-hidden="true">↑</span>
          <span className="source-option-copy">
            <span className="source-option-label">Upload JSON</span>
            <span className="source-option-description">
              Select an ecosystem extract from your computer.
            </span>
          </span>
          <span className="source-option-arrow" aria-hidden="true">→</span>
        </button>

        {history.length > 0 && (
          <button
            type="button"
            className="source-option source-option-history"
            onClick={() => setHistoryOpen((open) => !open)}
            disabled={fetching}
            aria-expanded={historyOpen}
            aria-controls="saved-run-history"
          >
            <span className="source-option-icon" aria-hidden="true">↶</span>
            <span className="source-option-copy">
              <span className="source-option-label">Load historical data</span>
              <span className="source-option-description">
                {history.length} saved {history.length === 1 ? 'run' : 'runs'} · latest {fmtSavedAt(history[0].savedAt)}
              </span>
            </span>
            <span className="source-option-arrow" aria-hidden="true">{historyOpen ? '↑' : '→'}</span>
          </button>
        )}
      </div>

      {historyOpen && history.length > 0 && (
        <div id="saved-run-history" className="history-picker">
          <div className="history-picker-heading">
            <div>
              <strong>Previous checks</strong>
              <span>Select a snapshot to restore its projects and results.</span>
            </div>
            <span>Newest first · up to 10</span>
          </div>
          <div className="history-run-list">
            {history.map((run) => (
              <button key={run.id} type="button" onClick={() => onLoadHistory(run.id)}>
                <span className={`history-run-type history-run-${run.checkType}`} aria-hidden="true">
                  {run.checkType === 'deep' ? '◇' : '⚡'}
                </span>
                <span className="history-run-copy">
                  <strong>{run.fileName || 'Saved ecosystem run'}</strong>
                  <small>{run.count} projects · {run.checkType === 'deep' ? 'Deep Check' : 'Quick Check'}</small>
                </span>
                <time dateTime={run.savedAt}>{fmtSavedAt(run.savedAt)}</time>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="source-drop-hint">You can also drag and drop a JSON file anywhere in this panel.</p>
      {parseError && <p className="dropzone-error" role="alert">{parseError}</p>}
    </section>
  )
}
