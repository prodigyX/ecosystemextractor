import { useEffect, useId, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Generic accessible modal shell: overlay + dialog, closes on Escape or a
 * click outside the dialog, moves focus into the dialog on open and restores
 * it to the previously focused element on close.
 *
 * @param {{title: string, onClose: () => void, wide?: boolean, size?: 'xl', children: React.ReactNode}} props
 */
export function Modal({ title, onClose, wide, size, children }) {
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => element instanceof HTMLElement && !element.hidden)
      if (focusable.length === 0) {
        e.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
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
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
