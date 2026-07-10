function fmtDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Builds table rows only from facts that actually exist for this project — no placeholders. */
function buildRows(facts = {}) {
  const rows = []

  if (facts.status != null) {
    const up = facts.status >= 200 && facts.status < 400
    rows.push({ check: 'Website Availability', status: up ? 'Up' : 'Down', tone: up ? 'good' : 'bad', value: `HTTP ${facts.status}` })
  }
  if (facts.sslDaysLeft != null) {
    const ok = facts.sslDaysLeft > 14
    rows.push({ check: 'SSL Certificate', status: ok ? 'Valid' : 'Expiring', tone: ok ? 'good' : 'warn', value: `${facts.sslDaysLeft}d left` })
  }
  if (facts.domainExpiry) {
    rows.push({ check: 'Domain', status: 'Registered', tone: 'good', value: `expires ${fmtDate(facts.domainExpiry)}` })
  }
  if (facts.xLatestPost) {
    rows.push({ check: 'X (Twitter) Posts', status: 'Active', tone: 'good', value: fmtDate(facts.xLatestPost) })
  } else if (facts.xFollowers != null) {
    rows.push({ check: 'X (Twitter)', status: 'Found', tone: 'info', value: `${facts.xFollowers.toLocaleString()} followers` })
  }
  if (facts.lastPush) {
    rows.push({
      check: 'GitHub Commits',
      status: facts.archived ? 'Archived' : 'Active',
      tone: facts.archived ? 'bad' : 'good',
      value: fmtDate(facts.lastPush),
    })
  }
  if (facts.discordMembers != null) {
    rows.push({ check: 'Discord', status: 'Active', tone: 'good', value: `${facts.discordMembers.toLocaleString()} members` })
  }
  if (facts.telegramLastPost) {
    rows.push({ check: 'Telegram', status: 'Active', tone: 'good', value: fmtDate(facts.telegramLastPost) })
  }
  if (facts.tvl != null) {
    rows.push({ check: 'TVL', status: 'Tracked', tone: 'good', value: `$${Math.round(facts.tvl).toLocaleString()}` })
  }
  if (facts.contentChanged != null) {
    rows.push({
      check: 'Site Content',
      status: facts.contentChanged ? 'Changed' : 'Unchanged',
      tone: facts.contentChanged ? 'good' : 'info',
      value: null,
    })
  }

  return rows
}

/**
 * Real per-signal facts reformatted as a compact status table — no
 * synthetic per-check trend data, just what the pipeline actually captured.
 * @param {{facts: object}} props
 */
export function ActivityOverview({ facts }) {
  const rows = buildRows(facts)
  if (rows.length === 0) {
    return <p className="empty">No check data available yet.</p>
  }
  return (
    <table className="activity-table">
      <thead>
        <tr>
          <th>Check</th>
          <th>Status</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.check}>
            <td className="activity-table-check">{r.check}</td>
            <td><span className={`badge activity-badge tone-badge-${r.tone}`}>{r.status}</span></td>
            <td className="activity-table-value">{r.value ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
