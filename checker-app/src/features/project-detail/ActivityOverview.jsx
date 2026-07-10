function fmtDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function xPostPresentation(iso) {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return { status: 'Unknown', tone: 'info' }
  const age = Math.floor((Date.now() - time) / 86400000)
  if (age <= 30) return { status: 'Active', tone: 'good' }
  if (age <= 90) return { status: 'Recent', tone: 'good' }
  if (age <= 180) return { status: 'Quiet', tone: 'warn' }
  return { status: 'Silent', tone: 'bad' }
}

function missingPostStatus(status) {
  if (status === 'protected') return 'Protected'
  if (status === 'no-public-posts') return 'No posts'
  if (status === 'rate-limited') return 'Rate limited'
  return 'Unavailable'
}

function followerPresentation(followers) {
  if (followers >= 20000) return { status: 'Established', tone: 'good' }
  if (followers >= 5000) return { status: 'Decent', tone: 'good' }
  if (followers >= 1000) return { status: 'Small', tone: 'info' }
  return { status: 'Tiny', tone: 'warn' }
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
  if (facts.xFollowers != null) {
    const presentation = followerPresentation(facts.xFollowers)
    rows.push({
      check: 'X Followers',
      status: presentation.status,
      tone: presentation.tone,
      value: facts.xFollowers.toLocaleString(),
    })
  }
  if (facts.xLatestPost) {
    const presentation = xPostPresentation(facts.xLatestPost)
    rows.push({
      check: 'X Last Post',
      status: presentation.status,
      tone: presentation.tone,
      value: fmtDate(facts.xLatestPost),
    })
  } else if (facts.xExists === true) {
    rows.push({
      check: 'X Last Post',
      status: missingPostStatus(facts.xPostStatus),
      tone: 'info',
      value: facts.xPostDetail || 'No public post timestamp returned',
    })
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
