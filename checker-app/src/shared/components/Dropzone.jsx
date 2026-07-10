import { fmtSavedAt } from '../lib/formatters.js'

/**
 * The "no projects loaded yet" view: a drag-and-drop target that is also a
 * real keyboard-operable control (role="button" + Enter/Space) for browsing
 * to a file, plus links to fetch live data or restore the last saved run.
 *
 * @param {{
 *   fetching: boolean,
 *   savedMeta: import('../../features/saved-runs/savedRunsService.js').SavedRunMeta|null,
 *   parseError: string|null,
 *   onDrop: (e: React.DragEvent) => void,
 *   onBrowseClick: () => void,
 *   onFetchFromBerachain: () => void,
 *   onLoadLastRun: () => void,
 * }} props
 */
export function Dropzone({ fetching, savedMeta, parseError, onDrop, onBrowseClick, onFetchFromBerachain, onLoadLastRun }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onBrowseClick()
    }
  }

  return (
    <div
      className="dropzone"
      role="button"
      tabIndex={0}
      aria-label="Upload JSON file or drag and drop it here"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={onBrowseClick}
      onKeyDown={handleKeyDown}
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
            <button
              type="button"
              className="dropzone-link"
              onClick={(e) => { e.stopPropagation(); onFetchFromBerachain() }}
            >
              Fetch from Berachain
            </button>
          </p>
          {savedMeta && (
            <p className="dropzone-sub dropzone-restore">
              <button
                type="button"
                className="dropzone-link"
                onClick={(e) => { e.stopPropagation(); onLoadLastRun() }}
              >
                Restore last run
              </button>
              {' '}— {savedMeta.count} projects · {fmtSavedAt(savedMeta.savedAt)}
            </p>
          )}
        </>
      )}
      {parseError && <p className="dropzone-error">{parseError}</p>}
    </div>
  )
}
