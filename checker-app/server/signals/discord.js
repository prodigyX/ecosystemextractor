import { fetchTimeout, ev } from '../util.js'

export async function checkDiscord(project, ctx) {
  const evidence = []
  const facts = { discordMembers: null, discordValid: null }
  const link = ctx.links?.discord
  if (!link) return { facts, evidence }

  const code = link.match(/(?:discord\.gg|discord\.com\/invite)\/([\w-]+)/i)?.[1]
  if (!code) return { facts, evidence }

  try {
    const res = await fetchTimeout(
      `https://discord.com/api/v10/invites/${code}?with_counts=true`,
      {},
      10000
    )
    if (res.ok) {
      const data = await res.json()
      facts.discordValid = true
      facts.discordMembers = data.approximate_member_count ?? null
      const online = data.approximate_presence_count
      const members = facts.discordMembers
      const detail = members
        ? `${members.toLocaleString()} members${online ? `, ${online.toLocaleString()} online` : ''}`
        : data.guild?.name

      // Discord is a secondary/community signal, weighted below the primary
      // website and X liveness signals — see server/signals/http.js and
      // server/signals/x.js.
      if (members == null) {
        evidence.push(ev('good', 'Discord invite valid', detail, 2))
      } else if (members >= 5000) {
        evidence.push(ev('good', 'Discord community large (5K+)', detail, 6))
      } else if (members >= 3000) {
        evidence.push(ev('good', 'Discord community healthy (3K+)', detail, 5))
      } else if (members >= 500) {
        evidence.push(ev('good', 'Discord community small', detail, 2))
      } else {
        // A near-empty server is the same strength of red flag as a broken
        // invite link below — both read as "no real community here" and
        // cap the score the same way (archived repo, suspended X account).
        evidence.push(ev('bad', 'Discord community tiny (<500) — possible clone/scam', detail, -25))
      }
    } else if (res.status === 404 || res.status === 410) {
      facts.discordValid = false
      // A broken invite link is a stronger red flag than "no community yet" —
      // it means the project once had (or claimed) a Discord and let the
      // link rot, which reads the same as other 'bad' abandonment signals
      // (archived GitHub repo, suspended X account) and caps the score.
      evidence.push(ev('bad', 'Discord invite expired/invalid', link, -25))
    } else {
      // A non-2xx/404/410 response (e.g. a transient 5xx or unexpected
      // status) tells us nothing conclusive about the invite — report it as
      // uncertain rather than silently producing no evidence at all.
      evidence.push(ev('info', 'Discord check inconclusive', `HTTP ${res.status}`, 0))
    }
  } catch (err) {
    evidence.push(ev('info', 'Discord check failed', err.message, 0))
  }

  return { facts, evidence }
}
