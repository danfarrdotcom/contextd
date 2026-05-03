import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../src/index';
import { hashKey } from '../../src/middleware/auth';

async function seed(db: D1Database) {
  const now = Date.now();
  await db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('acme', 'Acme', ${now})`);
  const hash = await hashKey('ctxd_testkey');
  await db.exec(`INSERT INTO api_keys (id, org_id, key_hash, name, created_at) VALUES ('k1', 'acme', '${hash}', 'test', ${now})`);
}

const AUTH = { 'Authorization': 'Bearer ctxd_testkey', 'Content-Type': 'application/json' };

describe('Collections', () => {
  beforeEach(() => seed(env.DB));

  it('creates a collection', async () => {
    const res = await app.request('/v1/orgs/acme/collections', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ slug: 'eng', name: 'Engineering', isPublic: false }),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; slug: string };
    expect(body.slug).toBe('eng');
  });

  it('returns 409 on duplicate slug', async () => {
    await app.request('/v1/orgs/acme/collections', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ slug: 'eng', name: 'Engineering' }),
    }, env);
    const res = await app.request('/v1/orgs/acme/collections', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ slug: 'eng', name: 'Engineering 2' }),
    }, env);
    expect(res.status).toBe(409);
  });

  it('gets a public collection without auth', async () => {
    await app.request('/v1/orgs/acme/collections', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ slug: 'eng', name: 'Engineering', isPublic: true }),
    }, env);
    const res = await app.request('/v1/acme/eng', {}, env);
    expect(res.status).toBe(200);
  });

  it('returns 403 for a private collection without auth', async () => {
    await app.request('/v1/orgs/acme/collections', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ slug: 'eng', name: 'Engineering', isPublic: false }),
    }, env);
    const res = await app.request('/v1/acme/eng', {}, env);
    expect(res.status).toBe(403);
  });
});
