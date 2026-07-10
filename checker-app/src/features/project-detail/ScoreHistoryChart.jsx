const WIDTH = 480
const HEIGHT = 140
const PAD_X = 8
const PAD_Y = 12

function fmtShortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Line chart of a project's score across its actual past Deep Check runs —
 * one real data point per run, not a synthetic daily series. Shown only
 * once at least two runs exist; otherwise the caller should show a
 * "not enough history yet" message instead of rendering this.
 *
 * @param {{history: Array<{ts: string, score: number}>}} props
 */
export function ScoreHistoryChart({ history }) {
  const n = history.length
  const xStep = n > 1 ? (WIDTH - PAD_X * 2) / (n - 1) : 0
  const yFor = (score) => HEIGHT - PAD_Y - (score / 100) * (HEIGHT - PAD_Y * 2)
  const points = history.map((h, i) => ({ x: PAD_X + i * xStep, y: yFor(h.score), ...h }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[n - 1].x.toFixed(1)} ${HEIGHT - PAD_Y} L ${points[0].x.toFixed(1)} ${HEIGHT - PAD_Y} Z`

  const last = points[n - 1]

  return (
    <svg className="history-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="history-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8c7feb" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8c7feb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#history-fill)" stroke="none" />
      <path d={linePath} fill="none" stroke="#8c7feb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? '#8c7feb' : '#a99cf5'}>
          <title>{`${fmtShortDate(p.ts)}: ${p.score}/100`}</title>
        </circle>
      ))}
      <text x={last.x} y={Math.max(10, last.y - 10)} textAnchor="end" className="history-chart-label">
        {last.score}
      </text>
    </svg>
  )
}
