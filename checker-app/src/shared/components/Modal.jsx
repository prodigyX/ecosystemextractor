import { useEffect, useRef } from 'react'

/**
 * Generic accessible modal shell: overlay + dialog, closes on Escape or a
 * click outside the dialog, moves focus into the dialog on open and restores
 * it to the previously focused element on close.
 *
 * @param {{title: string, onClose: () => void, wide?: boolean, size?: 'xl', children: React.ReactNode}} props
 */
export function Modal({ title, onClose, wide, size, children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    dialogRef.current?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal-dialog ${wide ? 'modal-wide' : ''} ${size === 'xl' ? 'modal-xl' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
