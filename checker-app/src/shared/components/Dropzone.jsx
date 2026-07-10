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
 * }} props
 */
export function Dropzone({ fetching, parseError, onDrop, onBrowseClick, onFetchFromBerachain }) {
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
        <p>Start with the live Berachain directory or provide an existing JSON extract.</p>
      </div>

      <div className="source-options">
        <button
          type="button"
          className="source-option source-option-fetch"
          onClick={onFetchFromBerachain}
          disabled={fetching}
        >
          <span className="source-option-icon" aria-hidden="true">
            <span className={fetching ? 'spin' : ''}>{fetching ? '⟳' : '◎'}</span>
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
      </div>

      <p className="source-drop-hint">You can also drag and drop a JSON file anywhere in this panel.</p>
      {parseError && <p className="dropzone-error" role="alert">{parseError}</p>}
    </section>
  )
}
