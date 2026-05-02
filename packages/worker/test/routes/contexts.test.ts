import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../src/index';
import { hashKey } from '../../src/middleware/auth';

async function seed(db: D1Database) {
  const now = Date.now();
  await db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('acme', 'Acme', ${now})`);
  const hash = await hashKey('ctxd_testkey');
  await db.exec(`INSERT INTO api_keys (id, org_id, key_hash, name, created_at) VALUES ('k1', 'acme', '${hash}', 'test', ${now})`);
  await db.exec(`INSERT INTO collections (id, org_id, slug, name, is_public, updated_at) VALUES ('col1', 'acme', 'eng', 'Engineering', 1, ${now})`);
}

const AUTH = { 'Authorization': 'Bearer ctxd_testkey', 'Content-Type': 'application/json' };

const CONTEXT_BODY = {
  slug: 'conventions',
  type: 'conventions',
  title: 'Conventions',
  content: '# Conventions\nUse TypeScript.',
  tags: ['backend'],
  priority: 'high',
};

describe('Contexts', () => {
  beforeEach(() => seed(env.DB));

  it('creates a context', async () => {
    const res = await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { slug: string };
    expect(body.slug).toBe('conventions');
  });

  it('lists contexts with tag filter', async () => {
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ ...CONTEXT_BODY, slug: 'arch', tags: ['frontend'] }),
    }, env);

    const res = await app.request('/v1/acme/eng/contexts?tags=backend', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { contexts: { slug: string }[] };
    expect(body.contexts).toHaveLength(1);
    expect(body.contexts[0].slug).toBe('conventions');
  });

  it('gets a single context with content', async () => {
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);

    const res = await app.request('/v1/acme/eng/contexts/conventions', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { content: string };
    expect(body.content).toContain('Use TypeScript');
  });

  it('deletes a context', async () => {
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);
    const res = await app.request('/v1/orgs/acme/eng/contexts/conventions', {
      method: 'DELETE',
      headers: AUTH,
    }, env);
    expect(res.status).toBe(200);
  });
});

describe('GET /:org/:collection/sync', () => {
  beforeEach(() => seed(env.DB));

  it('returns all contexts when no since param', async () => {
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);
    const res = await app.request('/v1/acme/eng/sync', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { contexts: { slug: string; content: string }[] };
    expect(body.contexts).toHaveLength(1);
    expect(body.contexts[0].content).toContain('Use TypeScript');
  });

  it('returns only contexts updated after since timestamp', async () => {
    const before = Date.now();
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify(CONTEXT_BODY),
    }, env);
    await app.request('/v1/orgs/acme/eng/contexts', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ ...CONTEXT_BODY, slug: 'arch' }),
    }, env);

    const res = await app.request(`/v1/acme/eng/sync?since=${before + 1}`, {}, env);
    const body = await res.json() as { contexts: { slug: string }[] };
    expect(body.contexts.length).toBeGreaterThanOrEqual(1);
  });
});
