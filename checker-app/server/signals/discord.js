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

      if (members == null) {
        evidence.push(ev('good', 'Discord invite valid', detail, 3))
      } else if (members >= 5000) {
        evidence.push(ev('good', 'Discord community large (5K+)', detail, 10))
      } else if (members >= 3000) {
        evidence.push(ev('good', 'Discord community healthy (3K+)', detail, 7))
      } else if (members >= 500) {
        evidence.push(ev('good', 'Discord community small', detail, 3))
      } else {
        evidence.push(ev('warn', 'Discord community tiny (<500)', detail, -2))
      }
    } else if (res.status === 404 || res.status === 410) {
      facts.discordValid = false
      evidence.push(ev('warn', 'Discord invite expired/invalid', link, -6))
    }
  } catch (err) {
    evidence.push(ev('info', 'Discord check failed', err.message, 0))
  }

  return { facts, evidence }
}
