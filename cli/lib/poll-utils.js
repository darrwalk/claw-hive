/**
 * Filters pending tasks to only those whose dependencies are all completed.
 *
 * @param {Array} tasks - List of task objects from hive-cli list --json
 * @param {string} agentType - Task type to match (e.g. "research", "dev")
 * @param {function} readTaskFn - (taskId) => task object or null
 * @returns {Array} Tasks that are unblocked and ready to be claimed
 */
export function filterReadyTasks(tasks, agentType, readTaskFn) {
  const matching = tasks.filter(t => t.type === agentType && !t.owner && t.status === 'pending');
  return matching.filter(t => {
    if (!t.depends_on || t.depends_on.length === 0) return true;
    return t.depends_on.every(depId => {
      const dep = readTaskFn(depId);
      return dep && dep.status === 'completed';
    });
  });
}
