const STATUS_LABELS = {
  idle: ['idle', '—'],
  checking: ['checking', 'Checking…'],
  alive: ['alive', 'Healthy'],
  dead: ['dead', 'Down'],
  'not-found': ['not-found', 'Not Found'],
  skip: ['skip', 'No URL'],
}

/**
 * @param {{status: import('../domain/scoring.js').CheckStatus}} props
 */
export function StatusBadge({ status }) {
  const [cls, label] = STATUS_LABELS[status] ?? ['idle', '—']
  return <span className={`badge ${cls}`}>{label}</span>
}
