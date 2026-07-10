import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchTimeout(url, opts = {}, ms = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, ...opts.headers },
      ...opts,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function loadEnv(dir) {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(dir, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i)
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env file */ }
  return env
}

export function daysAgo(dateLike) {
  const t = new Date(dateLike).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

export function daysUntil(dateLike) {
  const t = new Date(dateLike).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / 86400000)
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function fmtDate(dateLike) {
  const d = new Date(dateLike)
  return Number.isNaN(d.getTime()) ? String(dateLike) : d.toISOString().slice(0, 10)
}

/** Evidence item helper: level is 'good' | 'warn' | 'bad' | 'info' */
export function ev(level, label, detail = null, delta = 0) {
  return { level, label, detail, delta }
}
