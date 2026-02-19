import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pollUntilSettled } from '../lib/poll-wait.js';

const task = (status) => ({ task_id: 'test-001', status });

describe('pollUntilSettled', () => {
  it('returns completed exitCode 0 when task is immediately completed', async () => {
    const readFn = () => task('completed');
    const result = await pollUntilSettled(readFn, 'test-001', { startInterval: 0, maxInterval: 0 });
    assert.deepEqual(result, { status: 'completed', exitCode: 0 });
  });

  it('returns failed exitCode 1 when task is immediately failed', async () => {
    const readFn = () => task('failed');
    const result = await pollUntilSettled(readFn, 'test-001', { startInterval: 0, maxInterval: 0 });
    assert.deepEqual(result, { status: 'failed', exitCode: 1 });
  });

  it('returns abandoned exitCode 1 when task is abandoned', async () => {
    const readFn = () => task('abandoned');
    const result = await pollUntilSettled(readFn, 'test-001', { startInterval: 0, maxInterval: 0 });
    assert.deepEqual(result, { status: 'abandoned', exitCode: 1 });
  });

  it('returns timeout exitCode 1 when deadline exceeded', async () => {
    const readFn = () => task('pending');
    // deadline already passed
    const result = await pollUntilSettled(readFn, 'test-001', { deadline: Date.now() - 1, startInterval: 5, maxInterval: 30 });
    assert.deepEqual(result, { status: 'timeout', exitCode: 1 });
  });

  it('polls multiple times then resolves when status changes to completed', async () => {
    let callCount = 0;
    const readFn = () => {
      callCount++;
      return task(callCount >= 3 ? 'completed' : 'pending');
    };
    const result = await pollUntilSettled(readFn, 'test-001', { startInterval: 0, maxInterval: 0 });
    assert.deepEqual(result, { status: 'completed', exitCode: 0 });
    assert.equal(callCount, 3);
  });
});
