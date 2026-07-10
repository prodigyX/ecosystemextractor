import { QUALITY_LABELS } from '../../shared/domain/scoring.js'

const SIZE = 160
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const GAUGE_COLOR = {
  active: '#00b894',
  'likely-active': '#00cec9',
  unclear: '#fedb71',
  'likely-dead': '#ec8a19',
  dead: '#f3527f',
  error: '#f3527f',
}

/**
 * Circular progress gauge for the overall score, colored by verdict.
 * @param {{score: number, verdict: import('../../shared/domain/scoring.js').Verdict}} props
 */
export function ScoreGauge({ score, verdict }) {
  const clamped = Math.max(0, Math.min(100, score))
  const offset = CIRCUMFERENCE * (1 - clamped / 100)
  const color = GAUGE_COLOR[verdict] ?? '#a39289'
  const [, quality] = QUALITY_LABELS[verdict] ?? [null, '—']

  return (
    <div className="score-gauge">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="score-gauge-center">
        <span className="score-gauge-num">{score}</span>
        <span className="score-gauge-max">/100</span>
      </div>
      <div className="score-gauge-quality" style={{ color }}>{quality}</div>
    </div>
  )
}
