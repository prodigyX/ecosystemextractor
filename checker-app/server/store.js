import { readFileSync, writeFileSync } from 'node:fs'

/** Tiny JSON file store for content hashes / history across runs. */
export function createStore(path) {
  let data = {}
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch { /* first run */ }

  return {
    get: (key) => data[key] ?? null,
    set: (key, value) => {
      data[key] = value
    },
    save: () => {
      try {
        writeFileSync(path, JSON.stringify(data, null, 2))
      } catch (err) {
        console.error('[store] save failed:', err.message)
      }
    },
  }
}
