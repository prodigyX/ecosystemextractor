import { fetchTimeout, ev, daysAgo, fmtDate } from '../util.js'
import { TELEGRAM_MESSAGE_AGE_DAYS } from '../config.js'

export async function checkTelegram(project, ctx) {
  const evidence = []
  const facts = { telegramLastPost: null }
  const link = ctx.links?.telegram
  if (!link) return { facts, evidence }

  const handle = link.match(/t\.me\/(?:s\/)?([\w+]+)/i)?.[1]
  if (!handle || handle.startsWith('+')) {
    // +invite links are private groups; can't preview
    return { facts, evidence: [ev('info', 'Telegram is a private invite link', null, 0)] }
  }

  try {
    // t.me/s/<channel> renders a public preview with message timestamps
    const res = await fetchTimeout(`https://t.me/s/${handle}`, {}, 10000)
    if (!res.ok) {
      evidence.push(ev('info', 'Telegram preview unavailable', `HTTP ${res.status}`, 0))
      return { facts, evidence }
    }
    const html = await res.text()
    const times = [...html.matchAll(/datetime="([^"]+)"/g)]
      .map((m) => new Date(m[1]).getTime())
      .filter((t) => !Number.isNaN(t))

    if (!times.length) {
      // Redirected to plain profile — channel preview disabled or it's a group/bot
      evidence.push(ev('info', 'Telegram exists, no public message history', `@${handle}`, 0))
      return { facts, evidence }
    }

    const latest = new Date(Math.max(...times))
    facts.telegramLastPost = latest.toISOString()
    const age = daysAgo(latest)
    if (age <= TELEGRAM_MESSAGE_AGE_DAYS.active) {
      evidence.push(ev('good', `Telegram active (≤${TELEGRAM_MESSAGE_AGE_DAYS.active}d)`, `@${handle} · ${fmtDate(latest)}`, 8))
    } else if (age <= TELEGRAM_MESSAGE_AGE_DAYS.recent) {
      evidence.push(ev('good', `Telegram recent (≤${TELEGRAM_MESSAGE_AGE_DAYS.recent}d)`, `@${handle} · ${fmtDate(latest)}`, 4))
    } else if (age <= TELEGRAM_MESSAGE_AGE_DAYS.inactive) {
      evidence.push(ev('warn', `Telegram quiet (≤${TELEGRAM_MESSAGE_AGE_DAYS.inactive}d)`, `@${handle} · ${fmtDate(latest)}`, -3))
    } else {
      evidence.push(ev('warn', `Telegram dead (>${TELEGRAM_MESSAGE_AGE_DAYS.inactive}d)`, `@${handle} · ${fmtDate(latest)}`, -8))
    }
  } catch (err) {
    evidence.push(ev('info', 'Telegram check failed', err.message, 0))
  }

  return { facts, evidence }
}
