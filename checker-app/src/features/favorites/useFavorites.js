import { useCallback, useState } from 'react'
import { readFavoriteIds, writeFavoriteIds } from './favoritesService.js'

/**
 * Per-project "favorite/watchlist" star, persisted to localStorage by
 * project id. Independent of any loaded run — favoriting a project sticks
 * across file uploads and Berachain re-fetches, as long as the source data
 * keeps assigning that project the same id.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState(() => readFavoriteIds())

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        writeFavoriteIds(next)
      } catch {
        /* localStorage full or unavailable — non-fatal */
      }
      return next
    })
  }, [])

  const isFavorite = useCallback((id) => favorites.has(id), [favorites])

  return { isFavorite, toggleFavorite }
}
