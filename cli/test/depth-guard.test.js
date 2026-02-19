import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDepth, readDepth } from '../lib/lifecycle.js';

const task = (overrides) => ({
  task_id: 'test-001',
  status: 'pending',
  ...overrides,
});

describe('validateDepth', () => {
  it('accepts depth 0 and returns { valid: true, depth: 0 }', () => {
    const result = validateDepth(0);
    assert.deepEqual(result, { valid: true, depth: 0 });
  });

  it('accepts depth 1 and returns { valid: true, depth: 1 }', () => {
    const result = validateDepth(1);
    assert.deepEqual(result, { valid: true, depth: 1 });
  });

  it('rejects depth 2 with valid: false and error message', () => {
    const result = validateDepth(2);
    assert.equal(result.valid, false);
    assert.ok(typeof result.error === 'string', 'error should be a string');
    assert.ok(result.error.length > 0, 'error should not be empty');
  });

  it('accepts undefined and defaults to depth 0', () => {
    const result = validateDepth(undefined);
    assert.deepEqual(result, { valid: true, depth: 0 });
  });

  it('rejects NaN with valid: false and error message', () => {
    const result = validateDepth(NaN);
    assert.equal(result.valid, false);
    assert.ok(typeof result.error === 'string', 'error should be a string');
  });

  it('rejects negative depth with valid: false and error message', () => {
    const result = validateDepth(-1);
    assert.equal(result.valid, false);
    assert.ok(typeof result.error === 'string', 'error should be a string');
  });
});

describe('readDepth', () => {
  it('returns depth value from task object', () => {
    assert.equal(readDepth(task({ depth: 1 })), 1);
  });

  it('returns 0 when task has no depth field', () => {
    assert.equal(readDepth(task()), 0);
  });

  it('returns 0 when task depth is undefined', () => {
    assert.equal(readDepth(task({ depth: undefined })), 0);
  });
});
