import { promises as dns } from 'node:dns'
import tls from 'node:tls'
import { ev, daysUntil, fmtDate } from '../util.js'
import { SCORE_WEIGHTS } from '../config.js'

const W = SCORE_WEIGHTS.dnsSsl

function getCert(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 10000, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate()
        const authorized = socket.authorized
        socket.destroy()
        resolve({ cert, authorized })
      }
    )
    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('TLS timeout'))
    })
  })
}

export async function checkDnsSsl(project) {
  const evidence = []
  const facts = { dns: null, sslValidTo: null, sslDaysLeft: null }
  if (!project.website) return { facts, evidence }

  let host
  try {
    host = new URL(project.website).hostname
  } catch {
    return { facts, evidence: [ev('bad', 'Invalid website URL', project.website, W.invalidUrl)] }
  }

  // DNS — dns-ssl is a secondary signal, weighted below the primary website
  // and X liveness signals, but a confirmed non-existent domain (ENOTFOUND)
  // is still a strong, real negative finding, unlike a transient resolver
  // error (timeout, temporary failure, etc.), which is genuinely
  // inconclusive and must not be scored as if it were confirmed.
  try {
    const addrs = await dns.lookup(host, { all: true })
    facts.dns = addrs.map((a) => a.address)
    evidence.push(ev('good', 'DNS resolves', `${addrs.length} record(s)`, W.dnsResolves))
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      evidence.push(ev('bad', 'DNS does not resolve', host, W.dnsFails))
    } else {
      evidence.push(ev('info', 'DNS lookup inconclusive', err.code || err.message, 0))
    }
    return { facts, evidence } // no point checking SSL
  }

  // SSL
  try {
    const { cert, authorized } = await getCert(host)
    if (cert?.valid_to) {
      facts.sslValidTo = cert.valid_to
      const left = daysUntil(cert.valid_to)
      facts.sslDaysLeft = left
      if (left != null && left < 0) {
        evidence.push(ev('bad', 'SSL certificate expired', fmtDate(cert.valid_to), W.sslExpired))
      } else if (left != null && left < 14) {
        evidence.push(ev('warn', 'SSL certificate expires soon', `${left} days left`, W.sslExpiringSoon))
      } else if (!authorized) {
        evidence.push(ev('warn', 'SSL certificate not trusted', cert.issuer?.O || 'unknown issuer', W.sslUntrusted))
      } else {
        evidence.push(ev('good', 'SSL valid', `expires ${fmtDate(cert.valid_to)}`, W.sslValid))
      }
    }
  } catch (err) {
    evidence.push(ev('warn', 'HTTPS handshake failed', err.message, W.httpsHandshakeFailed))
  }

  return { facts, evidence }
}
