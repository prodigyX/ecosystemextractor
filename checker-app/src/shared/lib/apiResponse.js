function responseExcerpt(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

/** Reads an unsuccessful API response without assuming Vercel returned JSON. */
export async function apiErrorMessage(response) {
  const text = await response.text()
  try {
    const value = JSON.parse(text)
    if (typeof value?.error === 'string') return value.error
  } catch {
    // Vercel/platform errors are often plain text or HTML.
  }
  const excerpt = responseExcerpt(text)
  return excerpt ? `HTTP ${response.status}: ${excerpt}` : `HTTP ${response.status}`
}

/** Parses a successful JSON API response and produces a useful platform error. */
export async function jsonApiResponse(response) {
  if (!response.ok) throw new Error(await apiErrorMessage(response))
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`API returned a non-JSON response (HTTP ${response.status})`)
  }
}
