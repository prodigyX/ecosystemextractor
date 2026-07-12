/**
 * Full-screen busy indicator for actions triggered from the header's Data
 * menu, which closes immediately on click — so this is the only visible
 * feedback while the request is in flight (e.g. "Fetch latest", "Restore
 * last run"), unlike an inline spinner that would vanish with the menu.
 * @param {{title?: string, description?: string}} [props]
 */
export function FetchOverlay({
  title = 'Fetching latest projects…',
  description = 'Loading the ecosystem directory. This usually takes 10–20 seconds.',
}) {
  return (
    <div className="fetch-overlay" role="status" aria-live="polite">
      <div className="fetch-overlay-card">
        <span className="spinner-ring spinner-ring-lg fetch-overlay-spinner" aria-hidden="true" />
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </div>
  )
}
