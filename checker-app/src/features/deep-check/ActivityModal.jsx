import { Modal } from '../../shared/components/Modal.jsx'

const EVIDENCE_ICON = { good: '●', warn: '●', bad: '●', info: '○' }

/**
 * Live feed of individual signal-check results as they stream in during a
 * deep check, newest first — the "View Activity" drill-down for the batch
 * progress panel.
 *
 * @param {{
 *   log: Array<{projectName: string, signal: string, level: string, label: string, ts: number}>,
 *   onClose: () => void,
 * }} props
 */
export function ActivityModal({ log, onClose }) {
  return (
    <Modal title="Batch Check Activity" onClose={onClose} wide>
      {log.length === 0 ? (
        <p className="empty">No activity yet.</p>
      ) : (
        <div className="activity-log">
          {log.map((entry, i) => (
            <div key={i} className={`activity-item ev-${entry.level}`}>
              <span className="ev-dot">{EVIDENCE_ICON[entry.level] ?? '○'}</span>
              <span className="activity-time">{new Date(entry.ts).toLocaleTimeString()}</span>
              <span className="activity-project">{entry.projectName}</span>
              <span className="ev-signal">{entry.signal}</span>
              <span className="ev-label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
