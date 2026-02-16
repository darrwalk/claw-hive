import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canComplete, shouldAutoCompleteParent } from '../lib/lifecycle.js';

const task = (overrides) => ({
  task_id: 'test-001',
  status: 'pending',
  parent_task: null,
  ...overrides,
});

describe('canComplete', () => {
  it('allows completion when task has no children', () => {
    const result = canComplete('parent-1', []);
    assert.deepEqual(result, { allowed: true, children: 0, incomplete: 0 });
  });

  it('allows completion when all children are completed', () => {
    const tasks = [
      task({ task_id: 'c1', parent_task: 'parent-1', status: 'completed' }),
      task({ task_id: 'c2', parent_task: 'parent-1', status: 'completed' }),
    ];
    const result = canComplete('parent-1', tasks);
    assert.deepEqual(result, { allowed: true, children: 2, incomplete: 0 });
  });

  it('blocks when one child is pending', () => {
    const tasks = [
      task({ task_id: 'c1', parent_task: 'parent-1', status: 'completed' }),
      task({ task_id: 'c2', parent_task: 'parent-1', status: 'pending' }),
    ];
    const result = canComplete('parent-1', tasks);
    assert.deepEqual(result, { allowed: false, children: 2, incomplete: 1 });
  });

  it('blocks when one child is in_progress', () => {
    const tasks = [
      task({ task_id: 'c1', parent_task: 'parent-1', status: 'in_progress' }),
    ];
    const result = canComplete('parent-1', tasks);
    assert.deepEqual(result, { allowed: false, children: 1, incomplete: 1 });
  });

  it('blocks with mixed completed and pending children', () => {
    const tasks = [
      task({ task_id: 'c1', parent_task: 'parent-1', status: 'completed' }),
      task({ task_id: 'c2', parent_task: 'parent-1', status: 'pending' }),
      task({ task_id: 'c3', parent_task: 'parent-1', status: 'in_progress' }),
    ];
    const result = canComplete('parent-1', tasks);
    assert.deepEqual(result, { allowed: false, children: 3, incomplete: 2 });
  });

  it('ignores tasks belonging to other parents', () => {
    const tasks = [
      task({ task_id: 'c1', parent_task: 'parent-1', status: 'completed' }),
      task({ task_id: 'c2', parent_task: 'parent-2', status: 'pending' }),
    ];
    const result = canComplete('parent-1', tasks);
    assert.deepEqual(result, { allowed: true, children: 1, incomplete: 0 });
  });
});

describe('shouldAutoCompleteParent', () => {
  it('returns null when task has no parent', () => {
    const t = task({ parent_task: null, status: 'completed' });
    assert.equal(shouldAutoCompleteParent(t, []), null);
  });

  it('returns parent ID when all siblings are completed', () => {
    const completing = task({ task_id: 'c1', parent_task: 'p1', status: 'completed' });
    const allTasks = [
      completing,
      task({ task_id: 'c2', parent_task: 'p1', status: 'completed' }),
    ];
    assert.equal(shouldAutoCompleteParent(completing, allTasks), 'p1');
  });

  it('returns null when a sibling is still pending', () => {
    const completing = task({ task_id: 'c1', parent_task: 'p1', status: 'completed' });
    const allTasks = [
      completing,
      task({ task_id: 'c2', parent_task: 'p1', status: 'pending' }),
    ];
    assert.equal(shouldAutoCompleteParent(completing, allTasks), null);
  });

  it('returns null when a sibling is in_progress', () => {
    const completing = task({ task_id: 'c1', parent_task: 'p1', status: 'completed' });
    const allTasks = [
      completing,
      task({ task_id: 'c2', parent_task: 'p1', status: 'in_progress' }),
    ];
    assert.equal(shouldAutoCompleteParent(completing, allTasks), null);
  });

  it('returns parent ID for single child completing', () => {
    const completing = task({ task_id: 'c1', parent_task: 'p1', status: 'completed' });
    assert.equal(shouldAutoCompleteParent(completing, [completing]), 'p1');
  });
});
