/**
 * Stale task detection — pure function, no I/O.
 * Tasks in_progress beyond their deadline (or fallback threshold) are stale.
 */

export function findStaleTasks(tasks, thresholdMinutes = 60) {
  const now = Date.now()
  return tasks.filter(t => {
    if (t.status !== 'in_progress' || !t.claimed_at) return false
    const limit = t.deadline_minutes > 0 ? t.deadline_minutes : thresholdMinutes
    const lastLog = t.log?.length > 0 ? new Date(t.log[t.log.length - 1].ts).getTime() : 0
    const lastActivity = Math.max(new Date(t.claimed_at).getTime(), lastLog)
    return (now - lastActivity) > limit * 60000
  })
}
