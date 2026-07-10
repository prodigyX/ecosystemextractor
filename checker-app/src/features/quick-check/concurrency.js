/**
 * Runs `tasks` with at most `concurrency` running at once.
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
export async function runWithConcurrency(tasks, concurrency) {
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      await tasks[idx]()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}
