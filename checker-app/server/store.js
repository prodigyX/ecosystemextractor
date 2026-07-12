/**
 * Server-side in-memory key/value cache for deep-check signal data (X/GitHub
 * lookups, content-hash baselines, score history). This is a single
 * module-level singleton created once when this module is first loaded by
 * the process — every request handled by the same warm process/server
 * shares it, and it is never written to disk.
 *
 * Because there is no disk backing, the cache is cleared automatically
 * whenever the process restarts: a local `npm run dev` restart, or a fresh
 * serverless cold start on Vercel. (A Vite dev-server HMR reload of this
 * module does *not* count as a "restart" in that sense — module state only
 * resets on an actual process restart, which is what matters here: the goal
 * is "no cache surviving a deploy/redeploy indefinitely", not "clear on
 * every file save".)
 */
const data = Object.create(null)

export const store = {
  get: (key) => data[key] ?? null,
  set: (key, value) => {
    data[key] = value
  },
  getAll: () => data,
  clear: () => {
    for (const key of Object.keys(data)) delete data[key]
  },
}
