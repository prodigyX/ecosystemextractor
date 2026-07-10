const STORAGE_KEY = 'ecosystem-checker:favorites'

/** @returns {Set<string>} */
export function readFavoriteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

/** @param {Set<string>} ids */
export function writeFavoriteIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}
