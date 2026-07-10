import { fetchTimeout, ev, domainOf } from '../util.js'

let protocolsCache = null
let cacheTime = 0

async function getProtocols() {
  if (protocolsCache && Date.now() - cacheTime < 10 * 60 * 1000) return protocolsCache
  const res = await fetchTimeout('https://api.llama.fi/protocols', {}, 20000)
  if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`)
  protocolsCache = await res.json()
  cacheTime = Date.now()
  return protocolsCache
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fmtUsd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${Math.round(n)}`
}

export async function checkDefillama(project) {
  const evidence = []
  const facts = { tvl: null, tvlChange7d: null, llamaSlug: null }

  try {
    const protocols = await getProtocols()
    const domain = domainOf(project.website)
    const nameNorm = normalize(project.name)

    const match = protocols.find((p) => {
      const pDomain = domainOf(p.url)
      if (domain && pDomain && (pDomain === domain || domain.endsWith(`.${pDomain}`) || pDomain.endsWith(`.${domain}`))) return true
      return nameNorm.length > 3 && normalize(p.name) === nameNorm
    })

    if (!match) {
      evidence.push(ev('info', 'Not listed on DefiLlama', null, 0))
      return { facts, evidence }
    }

    facts.llamaSlug = match.slug
    facts.tvl = match.tvl
    facts.tvlChange7d = match.change_7d

    if (match.tvl == null) {
      evidence.push(ev('info', 'On DefiLlama, no TVL data', match.name, 0))
    } else if (match.tvl >= 100_000) {
      evidence.push(
        ev('good', 'Meaningful TVL on DefiLlama', `${match.name}: ${fmtUsd(match.tvl)}${match.change_7d != null ? ` (7d ${match.change_7d.toFixed(1)}%)` : ''}`, 12)
      )
    } else if (match.tvl >= 1_000) {
      evidence.push(ev('info', 'Low TVL on DefiLlama', `${match.name}: ${fmtUsd(match.tvl)}`, 2))
    } else {
      evidence.push(ev('warn', 'TVL near zero on DefiLlama', `${match.name}: ${fmtUsd(match.tvl)}`, -8))
    }
  } catch (err) {
    evidence.push(ev('info', 'DefiLlama check failed', err.message, 0))
  }

  return { facts, evidence }
}
