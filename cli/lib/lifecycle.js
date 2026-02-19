/**
 * Parent-child task lifecycle enforcement.
 * Pure functions — no I/O, no process.exit.
 */

export function validateDepth(depth) {
  if (depth === undefined || depth === null) return { valid: true, depth: 0 };
  const n = typeof depth === 'number' ? depth : parseInt(depth, 10);
  if (isNaN(n) || n < 0) return { valid: false, error: 'Invalid depth: must be a non-negative integer' };
  if (n >= 2) return { valid: false, error: `depth ${n} exceeds maximum (1). Sub-agents cannot create sub-tasks.` };
  return { valid: true, depth: n };
}

export function readDepth(task) {
  return task.depth ?? 0;
}

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
