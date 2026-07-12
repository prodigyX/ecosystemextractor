/**
 * Full-screen busy indicator shown while re-fetching project data from an
 * already-loaded state (the empty-state Dropzone has its own inline
 * indicator, but "Fetch latest" from the header's Data menu replaces an
 * existing list with no other visual feedback otherwise).
 */
export function FetchOverlay() {
  return (
    <div className="fetch-overlay" role="status" aria-live="polite">
      <div className="fetch-overlay-card">
        <span className="spinner-ring spinner-ring-lg fetch-overlay-spinner" aria-hidden="true" />
        <strong>Fetching latest projects…</strong>
        <span>Loading the ecosystem directory. This usually takes 10–20 seconds.</span>
      </div>
    </div>
  )
}
