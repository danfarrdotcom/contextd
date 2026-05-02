import { describe, it, expect } from 'vitest';
import { hashKey } from '../../src/middleware/auth';

describe('hashKey', () => {
  it('returns a hex string of length 64', async () => {
    const hash = await hashKey('ctxd_abc123');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for the same input', async () => {
    const a = await hashKey('ctxd_abc123');
    const b = await hashKey('ctxd_abc123');
    expect(a).toBe(b);
  });

  it('returns different hashes for different inputs', async () => {
    const a = await hashKey('ctxd_abc123');
    const b = await hashKey('ctxd_xyz789');
    expect(a).not.toBe(b);
  });
});
