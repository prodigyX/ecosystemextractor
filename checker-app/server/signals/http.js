import { fetchTimeout, ev, domainOf } from '../util.js'

const MAX_REDIRECTS = 6
const MAX_HTML = 800 * 1024

/**
 * Fetches the website following redirects manually so we can report the chain.
 * Returns facts: { finalUrl, status, redirects[], html } and evidence.
 */
export async function checkHttp(project) {
  const evidence = []
  const facts = { finalUrl: null, status: null, redirects: [], html: null }
  if (!project.website) {
    return { facts, evidence: [ev('info', 'No website URL', null, 0)] }
  }

  let url = project.website
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchTimeout(url, { redirect: 'manual' }, 15000)
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url).href
        facts.redirects.push({ from: url, to: next, status: res.status })
        url = next
        continue
      }
      facts.finalUrl = url
      facts.status = res.status
      if (res.ok) {
        const type = res.headers.get('content-type') || ''
        if (type.includes('html') || type === '') {
          facts.html = (await res.text()).slice(0, MAX_HTML)
        }
      }
      break
    }
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timed out' : err.cause?.code || err.message
    // Website liveness is one of the two primary "is this project alive at
    // all" signals (with X), so both its positive and negative deltas carry
    // more weight than secondary signals like DNS/domain/sitemap.
    evidence.push(ev('bad', 'Website unreachable', `${reason}`, -35))
    return { facts, evidence }
  }

  if (facts.status == null) {
    evidence.push(ev('bad', 'Redirect loop', `More than ${MAX_REDIRECTS} redirects`, -20))
    return { facts, evidence }
  }

  if (facts.status >= 200 && facts.status < 300) {
    evidence.push(ev('good', `Website up (HTTP ${facts.status})`, null, 32))
  } else if (facts.status === 401 || facts.status === 403) {
    evidence.push(ev('warn', `Website responds but blocks bots (HTTP ${facts.status})`, null, 12))
  } else if (facts.status >= 400 && facts.status < 500) {
    evidence.push(ev('bad', `Website client error (HTTP ${facts.status})`, null, -18))
  } else if (facts.status >= 500) {
    evidence.push(ev('bad', `Website server error (HTTP ${facts.status})`, null, -26))
  }

  // Redirect analysis: cross-domain redirect can mean project moved / domain parked
  if (facts.redirects.length > 0) {
    const startDomain = domainOf(project.website)
    const endDomain = domainOf(facts.finalUrl)
    if (startDomain && endDomain && startDomain !== endDomain) {
      evidence.push(
        ev('warn', 'Redirects to different domain', `${startDomain} → ${endDomain}`, -10)
      )
    } else {
      evidence.push(
        ev('info', `${facts.redirects.length} redirect(s)`, `final: ${facts.finalUrl}`, 0)
      )
    }
  }

  return { facts, evidence }
}
