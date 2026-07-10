/**
 * Second-stage choice shown once project data has loaded but before a check
 * has started. The two buttons explain the trade-off before committing to a
 * fast availability scan or the longer evidence pipeline.
 *
 * @param {{
 *   projectsCount: number,
 *   onQuickCheck: () => void,
 *   onDeepCheck: () => void,
 *   disabled?: boolean,
 * }} props
 */
export function CheckModePrompt({ projectsCount, onQuickCheck, onDeepCheck, disabled = false }) {
  return (
    <section className="check-mode-prompt" aria-labelledby="check-mode-title">
      <div className="check-mode-heading">
        <div>
          <span className="flow-step">Step 2 of 2</span>
          <h2 id="check-mode-title">How would you like to check these projects?</h2>
          <p>Your data is ready. Choose the level of detail you need.</p>
        </div>
        <span className="data-ready-badge">
          <span aria-hidden="true">✓</span> {projectsCount} projects ready
        </span>
      </div>

      <div className="check-mode-options">
        <button
          type="button"
          className="check-mode-card check-mode-quick"
          onClick={onQuickCheck}
          disabled={disabled}
          aria-describedby="quick-check-description"
        >
          <span className="check-mode-icon" aria-hidden="true">⚡</span>
          <span className="check-mode-copy">
            <span className="check-mode-label">Quick Check</span>
            <span id="quick-check-description" className="check-mode-description">
              Fast availability scan for project websites and X profiles.
            </span>
          </span>
          <span className="check-mode-action" aria-hidden="true">Run quick check →</span>
        </button>

        <button
          type="button"
          className="check-mode-card check-mode-deep"
          onClick={onDeepCheck}
          disabled={disabled}
          aria-describedby="deep-check-description"
        >
          <span className="check-mode-icon" aria-hidden="true">◇</span>
          <span className="check-mode-copy">
            <span className="check-mode-label-row">
              <span className="check-mode-label">Deep Check</span>
              <span className="check-mode-tag">Full report</span>
            </span>
            <span id="deep-check-description" className="check-mode-description">
              Runs all 10 signals with health scores, evidence, and activity details.
            </span>
          </span>
          <span className="check-mode-action" aria-hidden="true">Run deep check →</span>
        </button>
      </div>
    </section>
  )
}
