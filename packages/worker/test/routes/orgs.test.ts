import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../src/index';

async function seedOrg(db: D1Database) {
  await db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('acme', 'Acme', ${Date.now()})`);
  const { hashKey } = await import('../../src/middleware/auth');
  const hash = await hashKey('ctxd_testkey');
  await db.exec(`INSERT INTO api_keys (id, org_id, key_hash, name, created_at) VALUES ('k1', 'acme', '${hash}', 'test', ${Date.now()})`);
}

describe('POST /v1/orgs', () => {
  it('creates an org and returns an API key', async () => {
    const res = await app.request('/v1/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'myorg', name: 'My Org', keyName: 'default' }),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { org: { id: string }; key: string };
    expect(body.org.id).toBe('myorg');
    expect(body.key).toMatch(/^ctxd_/);
  });

  it('returns 409 if org slug already exists', async () => {
    await seedOrg(env.DB);
    const res = await app.request('/v1/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme', name: 'Acme 2', keyName: 'default' }),
    }, env);
    expect(res.status).toBe(409);
  });
});

describe('POST /v1/orgs/:org/keys', () => {
  beforeEach(() => seedOrg(env.DB));

  it('generates a new key for the org', async () => {
    const res = await app.request('/v1/orgs/acme/keys', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ctxd_testkey',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'ci' }),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { key: string; id: string };
    expect(body.key).toMatch(/^ctxd_/);
  });

  it('returns 403 if key belongs to a different org', async () => {
    await env.DB.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('other', 'Other', ${Date.now()})`);
    const res = await app.request('/v1/orgs/other/keys', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ctxd_testkey',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'ci' }),
    }, env);
    expect(res.status).toBe(403);
  });
});
