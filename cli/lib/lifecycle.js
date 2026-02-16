/**
 * Parent-child task lifecycle enforcement.
 * Pure functions — no I/O, no process.exit.
 */

export function canComplete(taskId, allTasks) {
  const children = allTasks.filter(t => t.parent_task === taskId);
  if (children.length === 0) return { allowed: true, children: 0, incomplete: 0 };
  const incomplete = children.filter(t => t.status !== 'completed');
  return { allowed: incomplete.length === 0, children: children.length, incomplete: incomplete.length };
}

export function shouldAutoCompleteParent(task, allTasks) {
  if (!task.parent_task) return null;
  const siblings = allTasks.filter(t => t.parent_task === task.parent_task);
  if (siblings.every(s => s.status === 'completed')) return task.parent_task;
  return null;
}
