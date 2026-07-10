/**
 * Extracts the bare @handle from an X/Twitter profile URL.
 * @param {string} url
 * @returns {string}
 */
export function xHandleFromUrl(url) {
  return url
    .replace('https://x.com/', '')
    .replace('https://twitter.com/', '')
    .replace(/^@/, '')
    .split('/')[0]
    .split('?')[0]
}
