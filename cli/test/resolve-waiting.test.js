import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStrandedTasks } from '../lib/resolve-waiting.js';

const task = (overrides) => ({
  task_id: 'test-001',
  status: 'pending',
  depends_on: [],
  ...overrides,
});

describe('findStrandedTasks', () => {
  it('returns empty array when no tasks exist', () => {
    assert.deepEqual(findStrandedTasks([]), []);
  });

  it('returns empty array when no pending tasks exist', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'completed' }),
      task({ task_id: 'task-002', status: 'failed' }),
    ];
    assert.deepEqual(findStrandedTasks(tasks), []);
  });

  it('returns empty array when pending tasks have no depends_on', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'failed' }),
      task({ task_id: 'task-002', status: 'pending', depends_on: [] }),
    ];
    assert.deepEqual(findStrandedTasks(tasks), []);
  });

  it('returns pending task when one of its depends_on is failed', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'failed' }),
      task({ task_id: 'task-002', status: 'pending', depends_on: ['task-001'] }),
    ];
    const stranded = findStrandedTasks(tasks);
    assert.equal(stranded.length, 1);
    assert.equal(stranded[0].task_id, 'task-002');
  });

  it('returns pending task when one of its depends_on is abandoned', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'abandoned' }),
      task({ task_id: 'task-002', status: 'pending', depends_on: ['task-001'] }),
    ];
    const stranded = findStrandedTasks(tasks);
    assert.equal(stranded.length, 1);
    assert.equal(stranded[0].task_id, 'task-002');
  });

  it('does NOT return in_progress tasks even if dependency failed', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'failed' }),
      task({ task_id: 'task-002', status: 'in_progress', depends_on: ['task-001'] }),
    ];
    assert.deepEqual(findStrandedTasks(tasks), []);
  });

  it('does NOT return pending tasks whose deps are all completed', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'completed' }),
      task({ task_id: 'task-002', status: 'pending', depends_on: ['task-001'] }),
    ];
    assert.deepEqual(findStrandedTasks(tasks), []);
  });

  it('returns stranded when mixed deps: one completed and one failed', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'completed' }),
      task({ task_id: 'task-002', status: 'failed' }),
      task({ task_id: 'task-003', status: 'pending', depends_on: ['task-001', 'task-002'] }),
    ];
    const stranded = findStrandedTasks(tasks);
    assert.equal(stranded.length, 1);
    assert.equal(stranded[0].task_id, 'task-003');
  });

  it('returns multiple stranded tasks in a single call', () => {
    const tasks = [
      task({ task_id: 'task-001', status: 'failed' }),
      task({ task_id: 'task-002', status: 'pending', depends_on: ['task-001'] }),
      task({ task_id: 'task-003', status: 'pending', depends_on: ['task-001'] }),
    ];
    const stranded = findStrandedTasks(tasks);
    assert.equal(stranded.length, 2);
  });
});
