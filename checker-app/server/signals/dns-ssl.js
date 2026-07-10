import { promises as dns } from 'node:dns'
import tls from 'node:tls'
import { ev, daysUntil, fmtDate } from '../util.js'

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
    return { facts, evidence: [ev('bad', 'Invalid website URL', project.website, -10)] }
  }

  // DNS
  try {
    const addrs = await dns.lookup(host, { all: true })
    facts.dns = addrs.map((a) => a.address)
    evidence.push(ev('good', 'DNS resolves', `${addrs.length} record(s)`, 3))
  } catch {
    evidence.push(ev('bad', 'DNS does not resolve', host, -25))
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
        evidence.push(ev('bad', 'SSL certificate expired', fmtDate(cert.valid_to), -12))
      } else if (left != null && left < 14) {
        evidence.push(ev('warn', 'SSL certificate expires soon', `${left} days left`, -3))
      } else if (!authorized) {
        evidence.push(ev('warn', 'SSL certificate not trusted', cert.issuer?.O || 'unknown issuer', -5))
      } else {
        evidence.push(ev('good', 'SSL valid', `expires ${fmtDate(cert.valid_to)}`, 5))
      }
    }
  } catch (err) {
    evidence.push(ev('warn', 'HTTPS handshake failed', err.message, -8))
  }

  return { facts, evidence }
}
