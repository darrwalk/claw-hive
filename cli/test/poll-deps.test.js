import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterReadyTasks } from '../lib/poll-utils.js';

const task = (overrides) => ({
  task_id: 'test-001',
  type: 'research',
  status: 'pending',
  owner: null,
  depends_on: [],
  ...overrides,
});

const readTask = (store) => (id) => store[id] ?? null;

describe('filterReadyTasks', () => {
  it('returns task with no depends_on', () => {
    const tasks = [task()];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 1);
  });

  it('returns task with empty depends_on array', () => {
    const tasks = [task({ depends_on: [] })];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 1);
  });

  it('returns task when all dependencies completed', () => {
    const tasks = [task({ depends_on: ['dep-1'] })];
    const store = { 'dep-1': { status: 'completed' } };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 1);
  });

  it('blocks task when dependency is pending', () => {
    const tasks = [task({ depends_on: ['dep-1'] })];
    const store = { 'dep-1': { status: 'pending' } };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 0);
  });

  it('blocks task when dependency is in_progress', () => {
    const tasks = [task({ depends_on: ['dep-1'] })];
    const store = { 'dep-1': { status: 'in_progress' } };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 0);
  });

  it('blocks task when any dependency incomplete (mixed)', () => {
    const tasks = [task({ depends_on: ['dep-1', 'dep-2'] })];
    const store = {
      'dep-1': { status: 'completed' },
      'dep-2': { status: 'pending' },
    };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 0);
  });

  it('returns task when all multiple dependencies completed', () => {
    const tasks = [task({ depends_on: ['dep-1', 'dep-2'] })];
    const store = {
      'dep-1': { status: 'completed' },
      'dep-2': { status: 'completed' },
    };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 1);
  });

  it('blocks task when dependency does not exist (safe fallback)', () => {
    const tasks = [task({ depends_on: ['nonexistent'] })];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 0);
  });

  it('filters out tasks with wrong type', () => {
    const tasks = [task({ type: 'dev' })];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 0);
  });

  it('filters out tasks already owned', () => {
    const tasks = [task({ owner: 'some-agent' })];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 0);
  });

  it('filters out non-pending tasks', () => {
    const tasks = [task({ status: 'in_progress' })];
    const result = filterReadyTasks(tasks, 'research', readTask({}));
    assert.equal(result.length, 0);
  });

  it('handles undefined depends_on field', () => {
    const t = task();
    delete t.depends_on;
    const result = filterReadyTasks([t], 'research', readTask({}));
    assert.equal(result.length, 1);
  });

  it('returns correct count with mixed ready and blocked tasks', () => {
    const tasks = [
      task({ task_id: 't1' }),
      task({ task_id: 't2', depends_on: ['dep-1'] }),
      task({ task_id: 't3', depends_on: ['dep-2'] }),
    ];
    const store = {
      'dep-1': { status: 'completed' },
      'dep-2': { status: 'pending' },
    };
    const result = filterReadyTasks(tasks, 'research', readTask(store));
    assert.equal(result.length, 2); // t1 (no deps) + t2 (dep completed)
  });
});
