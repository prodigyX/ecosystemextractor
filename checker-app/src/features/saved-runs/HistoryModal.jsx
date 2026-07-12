import { Modal } from '../../shared/components/Modal.jsx'
import { fmtSavedAt } from '../../shared/lib/formatters.js'

/**
 * Lists every saved run (newest first, up to 10) so the user can restore any
 * one of them, not just the most recent — reachable from the header's Data
 * menu once projects are already loaded. Mirrors the inline history picker
 * shown in the empty-state Dropzone, reusing the same markup/CSS.
 *
 * @param {{
 *   history: import('./savedRunsService.js').SavedRunMeta[],
 *   loadingId: string|null,
 *   onSelect: (id: string) => void,
 *   onClose: () => void,
 * }} props
 */
export function HistoryModal({ history, loadingId, onSelect, onClose }) {
  const busy = loadingId != null
  return (
    <Modal title="Previous checks" onClose={busy ? () => {} : onClose} wide>
      {history.length === 0 ? (
        <p className="empty">No saved runs yet.</p>
      ) : (
        <div className="history-picker">
          <div className="history-picker-heading">
            <div>
              <strong>Select a snapshot to restore</strong>
              <span>Replaces the current project list and results.</span>
            </div>
            <span>Newest first · up to 10</span>
          </div>
          <div className="history-run-list history-run-list-single">
            {history.map((run) => {
              const isLoading = run.id === loadingId
              return (
                <button key={run.id} type="button" onClick={() => onSelect(run.id)} disabled={busy} aria-busy={isLoading}>
                  {isLoading ? (
                    <span className="spinner-ring" aria-hidden="true" />
                  ) : (
                    <span className={`history-run-type history-run-${run.checkType}`} aria-hidden="true">
                      {run.checkType === 'deep' ? '◇' : '⚡'}
                    </span>
                  )}
                  <span className="history-run-copy">
                    <strong>{run.fileName || 'Saved ecosystem run'}</strong>
                    <small>
                      {isLoading ? 'Loading…' : `${run.count} projects · ${run.checkType === 'deep' ? 'Deep Check' : 'Quick Check'}`}
                    </small>
                  </span>
                  <time dateTime={run.savedAt}>{fmtSavedAt(run.savedAt)}</time>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
