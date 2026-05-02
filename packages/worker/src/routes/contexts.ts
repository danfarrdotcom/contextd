import { Hono, Context } from 'hono';
import { Env } from '../types';
import { hashKey } from '../middleware/auth';

type AppContext = Context<{ Bindings: Env; Variables: { orgId: string } }>;

export const contextsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

async function getCollectionId(db: D1Database, org: string, collection: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT id FROM collections WHERE org_id = ? AND slug = ?'
  ).bind(org, collection).first<{ id: string }>();
  return row?.id ?? null;
}

async function assertAccess(c: AppContext, org: string, collectionId: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    'SELECT is_public FROM collections WHERE id = ?'
  ).bind(collectionId).first<{ is_public: number }>();
  if (!row) return false;
  if (row.is_public) return true;
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const kh = await hashKey(authHeader.slice(7));
  const keyRow = await c.env.DB.prepare(
    'SELECT org_id FROM api_keys WHERE key_hash = ?'
  ).bind(kh).first<{ org_id: string }>();
  return keyRow?.org_id === org;
}

contextsRouter.post('/orgs/:org/:collection/contexts', async (c) => {
  const callerOrgId = c.get('orgId');
  const { org, collection } = c.req.param();
  if (callerOrgId !== org) return c.json({ error: 'Forbidden' }, 403);

  const collectionId = await getCollectionId(c.env.DB, org, collection);
  if (!collectionId) return c.json({ error: 'Collection not found' }, 404);

  const { slug, type, title, content, tags = [], scope, priority } = await c.req.json<{
    slug: string; type: string; title: string; content: string;
    tags?: string[]; scope?: string; priority?: string;
  }>();

  const existing = await c.env.DB.prepare(
    'SELECT id, version FROM contexts WHERE collection_id = ? AND slug = ?'
  ).bind(collectionId, slug).first<{ id: string; version: number }>();

  const now = Date.now();

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE contexts SET type=?, title=?, tags=?, scope=?, priority=?, version=version+1, updated_at=? WHERE id=?'
    ).bind(type, title, JSON.stringify(tags), scope ?? null, priority ?? null, now, existing.id).run();
    await c.env.KV.put(`context:${existing.id}`, content);
    return c.json({ id: existing.id, slug, version: existing.version + 1 });
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO contexts (id, collection_id, slug, type, title, tags, scope, priority, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
  ).bind(id, collectionId, slug, type, title, JSON.stringify(tags), scope ?? null, priority ?? null, now).run();
  await c.env.KV.put(`context:${id}`, content);

  return c.json({ id, slug, version: 1 }, 201);
});

contextsRouter.get('/:org/:collection/contexts', async (c) => {
  const { org, collection } = c.req.param();
  const collectionId = await getCollectionId(c.env.DB, org, collection);
  if (!collectionId) return c.json({ error: 'Not found' }, 404);
  if (!await assertAccess(c, org, collectionId)) return c.json({ error: 'Forbidden' }, 403);

  const typeFilter = c.req.query('type');
  const tagsFilter = c.req.query('tags');

  let query = 'SELECT id, slug, type, title, tags, scope, priority, version, updated_at FROM contexts WHERE collection_id = ?';
  const bindings: unknown[] = [collectionId];

  if (typeFilter) {
    query += ' AND type = ?';
    bindings.push(typeFilter);
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all<{
    id: string; slug: string; type: string; title: string; tags: string;
    scope: string | null; priority: string | null; version: number; updated_at: number;
  }>();

  let contexts = results.map(r => ({ ...r, tags: JSON.parse(r.tags) }));

  if (tagsFilter) {
    const filterTags = tagsFilter.split(',');
    contexts = contexts.filter(ctx =>
      filterTags.some(t => ctx.tags.includes(t))
    );
  }

  return c.json({ contexts });
});

contextsRouter.get('/:org/:collection/contexts/:slug', async (c) => {
  const { org, collection, slug } = c.req.param();
  const collectionId = await getCollectionId(c.env.DB, org, collection);
  if (!collectionId) return c.json({ error: 'Not found' }, 404);
  if (!await assertAccess(c, org, collectionId)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM contexts WHERE collection_id = ? AND slug = ?'
  ).bind(collectionId, slug).first<{ id: string; tags: string; [key: string]: unknown }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const content = await c.env.KV.get(`context:${row.id}`) ?? '';
  return c.json({ ...row, tags: JSON.parse(row.tags), content });
});

contextsRouter.delete('/orgs/:org/:collection/contexts/:slug', async (c) => {
  const callerOrgId = c.get('orgId');
  const { org, collection, slug } = c.req.param();
  if (callerOrgId !== org) return c.json({ error: 'Forbidden' }, 403);

  const collectionId = await getCollectionId(c.env.DB, org, collection);
  if (!collectionId) return c.json({ error: 'Not found' }, 404);

  const row = await c.env.DB.prepare(
    'SELECT id FROM contexts WHERE collection_id = ? AND slug = ?'
  ).bind(collectionId, slug).first<{ id: string }>();

  if (row) {
    await c.env.DB.prepare('DELETE FROM contexts WHERE id = ?').bind(row.id).run();
    await c.env.KV.delete(`context:${row.id}`);
  }

  return c.json({ deleted: true });
});

// Task 6: Delta sync endpoint
contextsRouter.get('/:org/:collection/sync', async (c) => {
  const { org, collection } = c.req.param();
  const collectionId = await getCollectionId(c.env.DB, org, collection);
  if (!collectionId) return c.json({ error: 'Not found' }, 404);
  if (!await assertAccess(c, org, collectionId)) return c.json({ error: 'Forbidden' }, 403);

  const since = c.req.query('since');
  const typeFilter = c.req.query('type');
  const tagsFilter = c.req.query('tags');

  let query = 'SELECT * FROM contexts WHERE collection_id = ?';
  const bindings: unknown[] = [collectionId];

  if (since) {
    const sinceMs = Number(since);
    if (!Number.isFinite(sinceMs)) return c.json({ error: '`since` must be a numeric timestamp' }, 400);
    query += ' AND updated_at > ?';
    bindings.push(sinceMs);
  }
  if (typeFilter) {
    query += ' AND type = ?';
    bindings.push(typeFilter);
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all<{
    id: string; slug: string; type: string; title: string; tags: string;
    scope: string | null; priority: string | null; version: number; updated_at: number;
  }>();

  let contexts = results.map(r => ({ ...r, tags: JSON.parse(r.tags) }));

  if (tagsFilter) {
    const filterTags = tagsFilter.split(',');
    contexts = contexts.filter(ctx =>
      filterTags.some(t => (ctx.tags as string[]).includes(t))
    );
  }

  const withContent = await Promise.all(
    contexts.map(async ctx => ({
      ...ctx,
      content: (await c.env.KV.get(`context:${ctx.id}`)) ?? '',
    }))
  );

  return c.json({ contexts: withContent, synced_at: Date.now() });
});
