/**
 * Stale task detection — pure function, no I/O.
 * Tasks in_progress beyond their deadline (or fallback threshold) are stale.
 */

export function findStaleTasks(tasks, thresholdMinutes = 60) {
  const now = Date.now()
  return tasks.filter(t => {
    if (t.status !== 'in_progress' || !t.claimed_at) return false
    const limit = t.deadline_minutes > 0 ? t.deadline_minutes : thresholdMinutes
    return (now - new Date(t.claimed_at).getTime()) > limit * 60000
  })
}
