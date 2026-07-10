import { useCallback, useState } from 'react'
import { extractProjects } from '../../shared/domain/projects.js'
import { fetchBerachainExtract } from './extractService.js'

/**
 * Owns the current project list and the two ways to populate it: a JSON file
 * upload/drop, or a live extraction from the Berachain ecosystem page.
 *
 * `handleFile` and `fetchFromBerachain` each accept an optional `onLoaded`
 * callback, invoked once the new project list has been set, so callers can
 * reset state owned by other hooks (quick-check progress, deep-check results,
 * expanded rows) whenever a fresh list replaces the current one.
 */
export function useProjects() {
  const [projects, setProjects] = useState([])
  const [fileName, setFileName] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [fetching, setFetching] = useState(false)

  const loadProjects = useCallback((rawArray, name, onLoaded) => {
    setProjects(extractProjects(rawArray))
    setFileName(name)
    setParseError(null)
    onLoaded?.()
  }, [])

  const handleFile = useCallback((file, onLoaded) => {
    if (!file) return
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)
        const arr = Array.isArray(json) ? json : [json]
        loadProjects(arr, file.name, onLoaded)
      } catch {
        setParseError('Invalid JSON — could not parse the file.')
      }
    }
    reader.readAsText(file)
  }, [loadProjects])

  const fetchFromBerachain = useCallback(async (onLoaded) => {
    if (fetching) return
    setFetching(true)
    setParseError(null)
    try {
      const arr = await fetchBerachainExtract()
      loadProjects(arr, 'explore.berachain.com (live)', onLoaded)
    } catch (err) {
      setParseError(`Fetch failed: ${err.message}`)
    } finally {
      setFetching(false)
    }
  }, [fetching, loadProjects])

  return {
    projects,
    setProjects,
    fileName,
    setFileName,
    parseError,
    setParseError,
    fetching,
    handleFile,
    fetchFromBerachain,
  }
}
