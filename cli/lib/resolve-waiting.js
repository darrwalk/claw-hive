/**
 * Resolve stranded pending tasks — pure function, no I/O.
 * Pending tasks whose depends_on includes a failed or abandoned task are stranded.
 */

export function findStrandedTasks(tasks) {
  const failedIds = new Set(
    tasks.filter(t => t.status === 'failed' || t.status === 'abandoned').map(t => t.task_id)
  );
  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.depends_on || t.depends_on.length === 0) return false;
    return t.depends_on.some(depId => failedIds.has(depId));
  });
}
