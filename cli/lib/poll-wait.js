/**
 * Poll-wait logic — pure function, no I/O.
 * readTaskFn(taskId) → { status, ... } | null
 */

export async function pollUntilSettled(readTaskFn, taskId, { deadline = Infinity, startInterval = 5, maxInterval = 30 } = {}) {
  let interval = startInterval;
  while (true) {
    const task = readTaskFn(taskId);
    if (task) {
      if (task.status === 'completed') return { status: 'completed', exitCode: 0 };
      if (task.status === 'failed') return { status: 'failed', exitCode: 1 };
      if (task.status === 'abandoned') return { status: 'abandoned', exitCode: 1 };
    }
    const nextWakeup = Date.now() + interval * 1000;
    if (nextWakeup > deadline) return { status: 'timeout', exitCode: 1 };
    await new Promise(r => setTimeout(r, interval * 1000));
    interval = Math.min(interval * 2, maxInterval);
  }
}
