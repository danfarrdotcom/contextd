import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashKey, generateKey } from '../../src/middleware/auth.ts';

describe('hashKey', () => {
  it('returns a hex string of length 64', async () => {
    const hash = await hashKey('ctxd_abc123');
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same input', async () => {
    const a = await hashKey('ctxd_abc123');
    const b = await hashKey('ctxd_abc123');
    assert.strictEqual(a, b);
  });

  it('returns different hashes for different inputs', async () => {
    const a = await hashKey('ctxd_abc123');
    const b = await hashKey('ctxd_xyz789');
    assert.notStrictEqual(a, b);
  });
});

describe('generateKey', () => {
  it('returns a key prefixed with ctxd_', () => {
    const key = generateKey();
    assert.match(key, /^ctxd_[a-f0-9]{40}$/);
  });

  it('returns a unique key each time', () => {
    const a = generateKey();
    const b = generateKey();
    assert.notStrictEqual(a, b);
  });
});
