import { Modal } from './Modal.jsx'

/**
 * Generic "are you sure?" dialog for actions that are disruptive but not
 * catastrophic (e.g. clearing a cache) — confirm/cancel, no destructive
 * red-button styling beyond marking the confirm action clearly.
 *
 * @param {{
 *   title: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   confirming?: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirming = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="confirm-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={confirming}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
