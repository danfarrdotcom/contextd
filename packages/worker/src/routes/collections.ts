import { Hono } from 'hono';
import { Env } from '../types';

export const collectionsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

collectionsRouter.post('/orgs/:org/collections', async (c) => {
  const callerOrgId = c.get('orgId');
  const targetOrg = c.req.param('org');
  if (callerOrgId !== targetOrg) return c.json({ error: 'Forbidden' }, 403);

  const { slug, name, isPublic = false } = await c.req.json<{ slug: string; name: string; isPublic?: boolean }>();
  if (!slug || !name) return c.json({ error: 'slug and name are required' }, 422);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM collections WHERE org_id = ? AND slug = ?'
  ).bind(targetOrg, slug).first();
  if (existing) return c.json({ error: 'Collection already exists' }, 409);

  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO collections (id, org_id, slug, name, is_public, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, targetOrg, slug, name, isPublic ? 1 : 0, now).run();

  return c.json({ id, org_id: targetOrg, slug, name, is_public: isPublic }, 201);
});

collectionsRouter.get('/:org/:collection', async (c) => {
  const { org, collection } = c.req.param();

  const row = await c.env.DB.prepare(
    'SELECT * FROM collections WHERE org_id = ? AND slug = ?'
  ).bind(org, collection).first<{ id: string; name: string; is_public: number }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  if (!row.is_public) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Forbidden' }, 403);
    const { hashKey } = await import('../middleware/auth');
    const keyHash = await hashKey(authHeader.slice(7));
    const keyRow = await c.env.DB.prepare(
      'SELECT org_id FROM api_keys WHERE key_hash = ?'
    ).bind(keyHash).first<{ org_id: string }>();
    if (!keyRow || keyRow.org_id !== org) return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json(row);
});

collectionsRouter.patch('/orgs/:org/:collection', async (c) => {
  const callerOrgId = c.get('orgId');
  const { org, collection } = c.req.param();
  if (callerOrgId !== org) return c.json({ error: 'Forbidden' }, 403);

  const { name, isPublic } = await c.req.json<{ name?: string; isPublic?: boolean }>();
  const now = Date.now();

  if (name !== undefined) {
    await c.env.DB.prepare(
      'UPDATE collections SET name = ?, updated_at = ? WHERE org_id = ? AND slug = ?'
    ).bind(name, now, org, collection).run();
  }
  if (isPublic !== undefined) {
    await c.env.DB.prepare(
      'UPDATE collections SET is_public = ?, updated_at = ? WHERE org_id = ? AND slug = ?'
    ).bind(isPublic ? 1 : 0, now, org, collection).run();
  }

  return c.json({ updated: true });
});

collectionsRouter.delete('/orgs/:org/:collection', async (c) => {
  const callerOrgId = c.get('orgId');
  const { org, collection } = c.req.param();
  if (callerOrgId !== org) return c.json({ error: 'Forbidden' }, 403);

  await c.env.DB.prepare(
    'DELETE FROM collections WHERE org_id = ? AND slug = ?'
  ).bind(org, collection).run();

  return c.json({ deleted: true });
});
