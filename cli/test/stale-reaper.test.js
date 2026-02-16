import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStaleTasks } from '../lib/stale-reaper.js';

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();

const task = (overrides) => ({
  task_id: 'test-001',
  status: 'pending',
  claimed_at: null,
  deadline_minutes: 0,
  ...overrides,
});

describe('findStaleTasks', () => {
  it('detects in_progress task past threshold', () => {
    const tasks = [task({ status: 'in_progress', claimed_at: minutesAgo(90) })];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 1);
  });

  it('skips in_progress task within threshold', () => {
    const tasks = [task({ status: 'in_progress', claimed_at: minutesAgo(30) })];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 0);
  });

  it('skips in_progress task with no claimed_at', () => {
    const tasks = [task({ status: 'in_progress', claimed_at: null })];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 0);
  });

  it('never flags pending or completed tasks', () => {
    const tasks = [
      task({ status: 'pending', claimed_at: minutesAgo(120) }),
      task({ status: 'completed', claimed_at: minutesAgo(120) }),
    ];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 0);
  });

  it('uses per-task deadline_minutes over global threshold', () => {
    const tasks = [
      task({ status: 'in_progress', claimed_at: minutesAgo(20), deadline_minutes: 15 }),
    ];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 1);
  });

  it('respects per-task deadline when within global but past task deadline', () => {
    const tasks = [
      task({ status: 'in_progress', claimed_at: minutesAgo(20), deadline_minutes: 15 }),
    ];
    // Would not be stale with global threshold of 60, but task deadline is 15
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 1);
  });

  it('uses global threshold when deadline_minutes is 0', () => {
    const tasks = [
      task({ status: 'in_progress', claimed_at: minutesAgo(30), deadline_minutes: 0 }),
    ];
    const stale = findStaleTasks(tasks, 60);
    assert.equal(stale.length, 0);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(findStaleTasks([], 60), []);
  });
});
