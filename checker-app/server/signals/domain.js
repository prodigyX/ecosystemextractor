import { fetchTimeout, ev, daysUntil, fmtDate, domainOf } from '../util.js'

let bootstrapCache = null

// TLDs missing from the IANA bootstrap but with known RDAP endpoints
const RDAP_OVERRIDES = {
  io: 'https://rdap.identitydigital.services/rdap',
  sh: 'https://rdap.identitydigital.services/rdap',
  ac: 'https://rdap.identitydigital.services/rdap',
}

/** IANA RDAP bootstrap: maps each TLD to its registry's RDAP base URL. */
async function rdapBaseFor(tld) {
  if (RDAP_OVERRIDES[tld]) return RDAP_OVERRIDES[tld]
  if (!bootstrapCache) {
    const res = await fetchTimeout('https://data.iana.org/rdap/dns.json', {}, 12000)
    if (!res.ok) throw new Error(`IANA bootstrap HTTP ${res.status}`)
    const data = await res.json()
    bootstrapCache = new Map()
    for (const [tlds, urls] of data.services) {
      for (const t of tlds) bootstrapCache.set(t, urls[0])
    }
  }
  return bootstrapCache.get(tld) ?? null
}

/**
 * Domain expiry via RDAP, using the IANA bootstrap to find the right registry.
 */
export async function checkDomain(project) {
  const evidence = []
  const facts = { domainExpiry: null, registrar: null }
  const domain = domainOf(project.website)
  if (!domain) return { facts, evidence }

  // Use the registrable domain (strip subdomains like app. / game.)
  const parts = domain.split('.')
  const registrable = parts.length > 2 ? parts.slice(-2).join('.') : domain
  const tld = registrable.split('.').pop()

  try {
    const base = await rdapBaseFor(tld)
    if (!base) {
      evidence.push(ev('info', 'No RDAP registry for TLD', `.${tld}`, 0))
      return { facts, evidence }
    }
    const res = await fetchTimeout(`${base.replace(/\/$/, '')}/domain/${registrable}`, {}, 12000)
    if (res.status === 404) {
      // Registry says the domain isn't registered at all
      evidence.push(ev('bad', 'Domain not registered', registrable, -12))
      return { facts, evidence }
    }
    if (!res.ok) {
      evidence.push(ev('info', 'Domain expiry unknown', `RDAP ${res.status} for ${registrable}`, 0))
      return { facts, evidence }
    }
    const data = await res.json()
    const exp = data.events?.find((e) => e.eventAction === 'expiration')?.eventDate
    facts.registrar =
      data.entities?.find((en) => en.roles?.includes('registrar'))?.vcardArray?.[1]
        ?.find((f) => f[0] === 'fn')?.[3] ?? null

    if (exp) {
      facts.domainExpiry = exp
      const left = daysUntil(exp)
      // Domain registration is a secondary signal, weighted below the
      // primary website and X liveness signals.
      if (left != null && left < 0) {
        evidence.push(ev('bad', 'Domain expired', fmtDate(exp), -15))
      } else if (left != null && left < 30) {
        evidence.push(ev('warn', 'Domain expires within 30 days', fmtDate(exp), -5))
      } else if (left != null && left < 90) {
        evidence.push(ev('info', 'Domain expires within 90 days', fmtDate(exp), 0))
      } else {
        evidence.push(ev('good', 'Domain registration healthy', `expires ${fmtDate(exp)}`, 3))
      }
    } else {
      evidence.push(ev('info', 'Domain expiry not in RDAP data', registrable, 0))
    }
  } catch (err) {
    evidence.push(ev('info', 'Domain lookup failed', err.message, 0))
  }

  return { facts, evidence }
}
