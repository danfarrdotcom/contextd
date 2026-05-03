import { Hono } from 'hono';
import { Env } from '../types';
import { generateKey, hashKey } from '../middleware/auth';

export const orgsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

orgsRouter.post('/orgs', async (c) => {
  const { slug, name, keyName } = await c.req.json<{ slug: string; name: string; keyName: string }>();
  if (!slug || !name) return c.json({ error: 'slug and name are required' }, 422);

  const existing = await c.env.DB.prepare('SELECT id FROM orgs WHERE id = ?').bind(slug).first();
  if (existing) return c.json({ error: 'Org already exists' }, 409);

  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)')
    .bind(slug, name, now).run();

  const key = generateKey();
  const keyHash = await hashKey(key);
  const keyId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO api_keys (id, org_id, key_hash, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(keyId, slug, keyHash, keyName || null, now).run();

  return c.json({ org: { id: slug, name }, key }, 201);
});

orgsRouter.post('/orgs/:org/keys', async (c) => {
  const callerOrgId = c.get('orgId');
  const targetOrg = c.req.param('org');
  if (callerOrgId !== targetOrg) return c.json({ error: 'Forbidden' }, 403);

  const { name } = await c.req.json<{ name?: string }>();
  const key = generateKey();
  const keyHash = await hashKey(key);
  const keyId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare('INSERT INTO api_keys (id, org_id, key_hash, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(keyId, targetOrg, keyHash, name || null, now).run();

  return c.json({ id: keyId, key }, 201);
});

orgsRouter.delete('/orgs/:org/keys/:id', async (c) => {
  const callerOrgId = c.get('orgId');
  const targetOrg = c.req.param('org');
  if (callerOrgId !== targetOrg) return c.json({ error: 'Forbidden' }, 403);
  const keyId = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND org_id = ?')
    .bind(keyId, targetOrg).run();
  return c.json({ deleted: true });
});

