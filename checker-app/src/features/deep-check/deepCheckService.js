import { apiErrorMessage } from '../../shared/lib/apiResponse.js'

/**
 * POSTs the project list to /api/deep-check and streams back newline-
 * delimited JSON progress events, invoking `onEvent` for each parsed event
 * as it arrives. Malformed lines are silently skipped; a non-OK response or
 * network failure throws.
 * @param {Array<{id: string, name: string, website: string|null, x: string|null}>} projects
 * @param {(event: object) => void} onEvent
 */
export async function runDeepCheckStream(projects, onEvent) {
  const res = await fetch('/api/deep-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projects }),
  })
  if (!res.ok) {
    throw new Error(await apiErrorMessage(res))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamError = null

  const parseLine = (line) => {
    if (!line.trim()) return
    try {
      const event = JSON.parse(line)
      if (event.type === 'error') streamError = event.error || 'Deep check stream failed'
      else onEvent(event)
    } catch {
      /* ignore malformed line */
    }
  }

  for (;;) {
    const { value, done: streamDone } = await reader.read()
    if (streamDone) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) parseLine(line)
  }
  // The server always terminates each event with '\n', so `buffer` is normally
  // empty here. Flush it defensively in case the stream ends without one.
  parseLine(buffer)
  if (streamError) throw new Error(streamError)
}
