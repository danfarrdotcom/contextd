# Remote Context Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remote context sync to contextd via a Cloudflare Worker API, letting teams publish and subscribe to shared context collections.

**Architecture:** A new `packages/worker` Cloudflare Worker handles the API (Hono router, D1 for metadata, KV for markdown content). The CLI gains `contextd auth` and `contextd sync` commands. The core package gains a `remote.ts` module that reads from `.context/remote/` on disk; `export` and `serve` merge local + remote contexts with local winning on conflicts.

**Tech Stack:** Hono (Worker routing), Cloudflare D1 + KV, Vitest + @cloudflare/vitest-pool-workers (Worker tests), existing chalk/ora/commander/fs-extra (CLI)

---

## File Map

**New files:**
- `packages/worker/package.json` — Worker package
- `packages/worker/wrangler.toml` — Wrangler config (D1 + KV bindings)
- `packages/worker/src/index.ts` — Worker entry point
- `packages/worker/src/middleware/auth.ts` — API key validation
- `packages/worker/src/routes/orgs.ts` — org + key management routes
- `packages/worker/src/routes/collections.ts` — collection CRUD routes
- `packages/worker/src/routes/contexts.ts` — context CRUD + sync route
- `packages/worker/src/db/schema.sql` — D1 schema
- `packages/worker/src/types.ts` — shared Worker types
- `packages/worker/vitest.config.ts` — Worker test config
- `packages/worker/test/middleware/auth.test.ts`
- `packages/worker/test/routes/orgs.test.ts`
- `packages/worker/test/routes/collections.test.ts`
- `packages/worker/test/routes/contexts.test.ts`
- `packages/core/src/remote.ts` — remote context load/sync logic
- `packages/cli/src/commands/auth.js` — `contextd auth login/logout`
- `packages/cli/src/commands/sync.js` — `contextd sync add/remove/list/now/publish`

**Modified files:**
- `packages/core/src/index.ts` — export remote functions
- `packages/cli/src/commands/export.js` — merge remote contexts
- `packages/cli/src/commands/serve.js` — auto-refresh on start
- `packages/cli/src/cli.js` — register auth + sync commands
- `.gitignore` (root) — add `.context/remote/`

---

## Task 1: Worker package scaffold

**Files:**
- Create: `packages/worker/package.json`
- Create: `packages/worker/wrangler.toml`
- Create: `packages/worker/src/types.ts`
- Create: `packages/worker/src/db/schema.sql`

- [ ] **Step 1: Create `packages/worker/package.json`**

```json
{
  "name": "@danfarrdotcom/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "hono": "^4.4.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240924.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/worker/wrangler.toml`**

```toml
name = "contextd-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "contextd"
database_id = "placeholder-replace-after-wrangler-d1-create"

[[kv_namespaces]]
binding = "KV"
id = "placeholder-replace-after-wrangler-kv-namespace-create"

[vars]
ENVIRONMENT = "development"
```

- [ ] **Step 3: Create `packages/worker/src/types.ts`**

```typescript
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ENVIRONMENT: string;
}

export interface Org {
  id: string;
  name: string;
  created_at: number;
}

export interface ApiKey {
  id: string;
  org_id: string;
  key_hash: string;
  name: string | null;
  created_at: number;
}

export interface Collection {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  is_public: number; // D1 stores booleans as 0/1
  updated_at: number;
}

export interface Context {
  id: string;
  collection_id: string;
  slug: string;
  type: string;
  title: string;
  tags: string; // JSON array string
  scope: string | null;
  priority: string | null;
  version: number;
  updated_at: number;
}
```

- [ ] **Step 4: Create `packages/worker/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS orgs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  key_hash    TEXT UNIQUE NOT NULL,
  name        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  is_public  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS contexts (
  id            TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  slug          TEXT NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',
  scope         TEXT,
  priority      TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  updated_at    INTEGER NOT NULL,
  UNIQUE(collection_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_contexts_collection ON contexts(collection_id);
CREATE INDEX IF NOT EXISTS idx_contexts_updated ON contexts(updated_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
```

- [ ] **Step 5: Install dependencies**

```bash
cd packages/worker && pnpm install
```

- [ ] **Step 6: Commit**

```bash
git add packages/worker/
git commit -m "feat(worker): scaffold Cloudflare Worker package"
```

---

## Task 2: Auth middleware

**Files:**
- Create: `packages/worker/src/middleware/auth.ts`
- Create: `packages/worker/test/middleware/auth.test.ts`
- Create: `packages/worker/vitest.config.ts`

- [ ] **Step 1: Create `packages/worker/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 2: Write the failing auth middleware test**

```typescript
// packages/worker/test/middleware/auth.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SELF } from 'cloudflare:test';
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/worker && pnpm test
```

Expected: FAIL with "Cannot find module '../../src/middleware/auth'"

- [ ] **Step 4: Create `packages/worker/src/middleware/auth.ts`**

```typescript
import { Context, Next } from 'hono';
import { Env } from '../types';

export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `ctxd_${hex}`;
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const key = authHeader.slice(7);
  const keyHash = await hashKey(key);

  const row = await c.env.DB.prepare(
    'SELECT org_id FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first<{ org_id: string }>();

  if (!row) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  c.set('orgId', row.org_id);
  await next();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/worker && pnpm test
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/worker/src/middleware/auth.ts packages/worker/test/middleware/auth.test.ts packages/worker/vitest.config.ts
git commit -m "feat(worker): add API key hashing and auth middleware"
```

---

## Task 3: Orgs and keys routes

**Files:**
- Create: `packages/worker/src/routes/orgs.ts`
- Create: `packages/worker/test/routes/orgs.test.ts`

- [ ] **Step 1: Write the failing orgs tests**

```typescript
// packages/worker/test/routes/orgs.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/worker && pnpm test test/routes/orgs.test.ts
```

Expected: FAIL with "Cannot find module '../../src/index'"

- [ ] **Step 3: Create `packages/worker/src/routes/orgs.ts`**

```typescript
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
```

- [ ] **Step 4: Create `packages/worker/src/index.ts`**

```typescript
import { Hono } from 'hono';
import { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { orgsRouter } from './routes/orgs';
import { collectionsRouter } from './routes/collections';
import { contextsRouter } from './routes/contexts';

const app = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

// Auth required for all /orgs write routes and private collection reads
app.use('/v1/orgs/*', authMiddleware);

app.route('/v1', orgsRouter);
app.route('/v1', collectionsRouter);
app.route('/v1', contextsRouter);

app.get('/', (c) => c.json({ name: 'contextd API', version: '1' }));

export default app;
```

- [ ] **Step 5: Create stub files so index.ts compiles**

Create `packages/worker/src/routes/collections.ts`:
```typescript
import { Hono } from 'hono';
import { Env } from '../types';
export const collectionsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();
```

Create `packages/worker/src/routes/contexts.ts`:
```typescript
import { Hono } from 'hono';
import { Env } from '../types';
export const contextsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/worker && pnpm test test/routes/orgs.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/worker/src/
git commit -m "feat(worker): add org and API key management routes"
```

---

## Task 4: Collections routes

**Files:**
- Modify: `packages/worker/src/routes/collections.ts`
- Create: `packages/worker/test/routes/collections.test.ts`

- [ ] **Step 1: Write the failing collections tests**

```typescript
// packages/worker/test/routes/collections.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/worker && pnpm test test/routes/collections.test.ts
```

Expected: FAIL (404 responses — routes not implemented)

- [ ] **Step 3: Implement `packages/worker/src/routes/collections.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/worker && pnpm test test/routes/collections.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/routes/collections.ts packages/worker/test/routes/collections.test.ts
git commit -m "feat(worker): add collections routes"
```

---

## Task 5: Contexts CRUD routes

**Files:**
- Modify: `packages/worker/src/routes/contexts.ts`
- Create: `packages/worker/test/routes/contexts.test.ts`

- [ ] **Step 1: Write failing contexts tests**

```typescript
// packages/worker/test/routes/contexts.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/worker && pnpm test test/routes/contexts.test.ts
```

Expected: FAIL (routes not implemented)

- [ ] **Step 3: Implement `packages/worker/src/routes/contexts.ts`**

```typescript
import { Hono } from 'hono';
import { Env } from '../types';
import { hashKey } from '../middleware/auth';

export const contextsRouter = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

async function getCollectionId(db: D1Database, org: string, collection: string): Promise<string | null> {
  const row = await db.prepare(
    'SELECT id FROM collections WHERE org_id = ? AND slug = ?'
  ).bind(org, collection).first<{ id: string }>();
  return row?.id ?? null;
}

async function assertAccess(c: any, org: string, collectionId: string): Promise<boolean> {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/worker && pnpm test test/routes/contexts.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/routes/contexts.ts packages/worker/test/routes/contexts.test.ts
git commit -m "feat(worker): add contexts CRUD routes"
```

---

## Task 6: Delta sync endpoint

**Files:**
- Modify: `packages/worker/src/routes/contexts.ts`
- Modify: `packages/worker/test/routes/contexts.test.ts`

- [ ] **Step 1: Add the failing sync test to `packages/worker/test/routes/contexts.test.ts`**

Add this describe block at the end of the file (before the final `}`):

```typescript
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
    // Both were created after `before`, so both should be included
    expect(body.contexts.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/worker && pnpm test test/routes/contexts.test.ts
```

Expected: FAIL on the sync tests (404)

- [ ] **Step 3: Add the sync route to `packages/worker/src/routes/contexts.ts`**

Add this route after `contextsRouter.delete(...)`:

```typescript
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
    query += ' AND updated_at > ?';
    bindings.push(Number(since));
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
```

- [ ] **Step 4: Run all Worker tests**

```bash
cd packages/worker && pnpm test
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/routes/contexts.ts packages/worker/test/routes/contexts.test.ts
git commit -m "feat(worker): add delta sync endpoint with since/type/tags filtering"
```

---

## Task 7: Remote context module in core

**Files:**
- Create: `packages/core/src/remote.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/remote.ts`**

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { CONTEXT_DIR, ContextFile, loadContextFile } from './context.js';

export const REMOTE_DIR = path.join(CONTEXT_DIR, 'remote');
export const SOURCES_FILE = path.join(CONTEXT_DIR, 'sources.json');
const AUTO_REFRESH_HOURS = 24;

export interface SyncSource {
  name: string;
  url: string;
  filters?: { type?: string; tags?: string[] };
  last_synced: string | null;
}

export interface SourcesConfig {
  sources: SyncSource[];
}

export async function loadSourcesConfig(rootDir: string): Promise<SourcesConfig> {
  const filePath = path.join(rootDir, SOURCES_FILE);
  if (!await fs.pathExists(filePath)) return { sources: [] };
  return fs.readJson(filePath);
}

export async function writeSourcesConfig(rootDir: string, config: SourcesConfig): Promise<void> {
  const filePath = path.join(rootDir, SOURCES_FILE);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, config, { spaces: 2 });
}

export async function loadRemoteContexts(rootDir: string): Promise<ContextFile[]> {
  const remoteDir = path.join(rootDir, REMOTE_DIR);
  if (!await fs.pathExists(remoteDir)) return [];
  const files = await glob('**/*.md', { cwd: remoteDir, absolute: true });
  return Promise.all(files.map(loadContextFile));
}

export function parseSourceUrl(url: string): { org: string; collection: string; apiBase: string } | null {
  // contextd://acme/eng -> https://contextd-worker.workers.dev/v1/acme/eng
  // https://my-worker.workers.dev/v1/acme/eng -> direct
  if (url.startsWith('contextd://')) {
    const rest = url.slice('contextd://'.length);
    const [org, collection] = rest.split('/');
    if (!org || !collection) return null;
    return { org, collection, apiBase: 'https://contextd-worker.workers.dev/v1' };
  }
  if (url.startsWith('https://')) {
    const u = new URL(url);
    const parts = u.pathname.replace('/v1/', '').split('/');
    if (parts.length < 2) return null;
    return { org: parts[0], collection: parts[1], apiBase: `${u.origin}/v1` };
  }
  return null;
}

export async function syncSource(
  rootDir: string,
  source: SyncSource,
  token?: string
): Promise<{ synced: number; errors: string[] }> {
  const parsed = parseSourceUrl(source.url);
  if (!parsed) throw new Error(`Invalid source URL: ${source.url}`);

  const { org, collection, apiBase } = parsed;
  const since = source.last_synced ? new Date(source.last_synced).getTime() : undefined;
  const isFullSync = !since;

  const params = new URLSearchParams();
  if (since) params.set('since', String(since));
  if (source.filters?.type) params.set('type', source.filters.type);
  if (source.filters?.tags?.length) params.set('tags', source.filters.tags.join(','));

  const url = `${apiBase}/${org}/${collection}/sync?${params}`;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sync failed (${res.status}): ${text}`);
  }

  const { contexts } = await res.json() as { contexts: Array<{
    slug: string; type: string; title: string; content: string;
    tags: string[]; scope: string | null; priority: string | null; updated_at: number;
  }> };

  const cacheDir = path.join(rootDir, REMOTE_DIR, org, collection);

  // On full sync (first time or forced), clear cache first so deleted remote contexts don't linger
  if (isFullSync && await fs.pathExists(cacheDir)) {
    await fs.emptyDir(cacheDir);
  }
  await fs.ensureDir(cacheDir);

  const errors: string[] = [];
  for (const ctx of contexts) {
    try {
      const frontmatter = [
        '---',
        `title: ${ctx.title}`,
        `tags: [${ctx.tags.join(', ')}]`,
        `priority: ${ctx.priority || 'normal'}`,
        `updated: ${new Date(ctx.updated_at).toISOString().split('T')[0]}`,
        ctx.scope ? `scope: ${ctx.scope}` : null,
        '---',
      ].filter(Boolean).join('\n');

      const fileContent = `${frontmatter}\n\n${ctx.content}`;
      await fs.writeFile(path.join(cacheDir, `${ctx.slug}.md`), fileContent, 'utf-8');
    } catch (err: unknown) {
      errors.push(`Failed to write ${ctx.slug}: ${(err as Error).message}`);
    }
  }

  return { synced: contexts.length - errors.length, errors };
}

export function shouldAutoRefresh(source: SyncSource): boolean {
  if (!source.last_synced) return true;
  const age = Date.now() - new Date(source.last_synced).getTime();
  return age > AUTO_REFRESH_HOURS * 60 * 60 * 1000;
}

export async function mergeContexts(
  localContexts: ContextFile[],
  remoteContexts: ContextFile[]
): Promise<ContextFile[]> {
  const localSlugs = new Set(localContexts.map(c => path.basename(c.path)));
  const uniqueRemote = remoteContexts.filter(c => !localSlugs.has(path.basename(c.path)));
  return [...localContexts, ...uniqueRemote];
}
```

- [ ] **Step 2: Update `packages/core/src/index.ts`**

```typescript
export {
  CONTEXT_DIR,
  findRoot,
  loadContextFile,
  loadAllContext,
  getRelevantContext,
  getContextStats,
  buildExportOutput,
} from './context.js';

export type {
  ContextMeta,
  ContextFile,
  AllContext,
  ContextStats,
} from './context.js';

export {
  REMOTE_DIR,
  SOURCES_FILE,
  loadSourcesConfig,
  writeSourcesConfig,
  loadRemoteContexts,
  parseSourceUrl,
  syncSource,
  shouldAutoRefresh,
  mergeContexts,
} from './remote.js';

export type { SyncSource, SourcesConfig } from './remote.js';
```

- [ ] **Step 3: Build core**

```bash
cd packages/core && pnpm build
```

Expected: Compiled with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/remote.ts packages/core/src/index.ts
git commit -m "feat(core): add remote context sync module"
```

---

## Task 8: `contextd auth` CLI command

**Files:**
- Create: `packages/cli/src/commands/auth.js`

- [ ] **Step 1: Create `packages/cli/src/commands/auth.js`**

```javascript
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline/promises';

const CONFIG_PATH = path.join(process.env.HOME || '~', '.contextd', 'config.json');
const API_BASE = process.env.CONTEXTD_API_URL || 'https://contextd-worker.workers.dev/v1';

export async function getToken() {
  if (!await fs.pathExists(CONFIG_PATH)) return null;
  const config = await fs.readJson(CONFIG_PATH);
  return config.token || null;
}

export async function authCommand(action) {
  if (action === 'logout') {
    await fs.remove(CONFIG_PATH);
    console.log(chalk.green('\n  Logged out.\n'));
    return;
  }

  if (action !== 'login') {
    console.log(chalk.red(`\n  Unknown action: ${action}. Use login or logout.\n`));
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const orgSlug = await rl.question(chalk.cyan('  Org slug (e.g. acme): '));
    const keyName = await rl.question(chalk.cyan('  Key name (e.g. laptop): '));
    const existingToken = await rl.question(
      chalk.cyan('  Existing API key (leave blank to create a new org): ')
    );

    const spinner = ora('Authenticating...').start();

    let key;
    if (existingToken.trim()) {
      // Add a new key to existing org
      const res = await fetch(`${API_BASE}/orgs/${orgSlug}/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${existingToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: keyName }),
      });
      if (!res.ok) {
        const body = await res.json();
        spinner.fail('Authentication failed');
        console.log(chalk.red(`\n  ${body.error || res.statusText}\n`));
        process.exit(1);
      }
      const data = await res.json();
      key = data.key;
    } else {
      // Create new org
      const res = await fetch(`${API_BASE}/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: orgSlug, name: orgSlug, keyName }),
      });
      if (!res.ok) {
        const body = await res.json();
        spinner.fail('Failed to create org');
        console.log(chalk.red(`\n  ${body.error || res.statusText}\n`));
        process.exit(1);
      }
      const data = await res.json();
      key = data.key;
    }

    await fs.ensureDir(path.dirname(CONFIG_PATH));
    await fs.writeJson(CONFIG_PATH, { token: key, org: orgSlug }, { spaces: 2 });

    spinner.succeed(chalk.green('Authenticated!'));
    console.log(chalk.gray(`\n  Config saved to ${CONFIG_PATH}`));
    console.log(chalk.yellow(`  Save your key somewhere safe — it won't be shown again.\n`));
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 2: Test manually**

```bash
cd packages/cli && node src/cli.js auth login
```

Verify it prompts for org slug, key name, and existing key. (You don't need a real Worker running to verify the prompts display correctly — Ctrl+C after confirming prompts appear.)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/auth.js
git commit -m "feat(cli): add contextd auth login/logout command"
```

---

## Task 9: `contextd sync` CLI commands

**Files:**
- Create: `packages/cli/src/commands/sync.js`

- [ ] **Step 1: Create `packages/cli/src/commands/sync.js`**

```javascript
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  findRoot,
  loadSourcesConfig,
  writeSourcesConfig,
  loadRemoteContexts,
  parseSourceUrl,
  syncSource,
} from '@danfarrdotcom/core';
import { getToken } from './auth.js';

export async function syncCommand(action, args, options) {
  const rootDir = await findRoot(process.cwd());
  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  switch (action) {
    case 'add': return syncAdd(rootDir, args[0], options);
    case 'remove': return syncRemove(rootDir, args[0]);
    case 'list': return syncList(rootDir);
    case 'now': return syncNow(rootDir, options);
    default:
      console.log(chalk.red(`\n  Unknown sync action: ${action}\n`));
      console.log(chalk.gray('  Available: add, remove, list, now, publish\n'));
      process.exit(1);
  }
}

async function syncAdd(rootDir, url, options) {
  if (!url) {
    console.log(chalk.red('\n  Usage: contextd sync add <url>\n'));
    process.exit(1);
  }

  const parsed = parseSourceUrl(url);
  if (!parsed) {
    console.log(chalk.red(`\n  Invalid URL: ${url}`));
    console.log(chalk.gray('  Expected: contextd://org/collection or https://...\n'));
    process.exit(1);
  }

  const config = await loadSourcesConfig(rootDir);
  const name = `${parsed.org}/${parsed.collection}`;

  if (config.sources.find(s => s.name === name)) {
    console.log(chalk.yellow(`\n  Already subscribed to ${name}\n`));
    return;
  }

  // Parse filters from URL query params (contextd://acme/eng?tags=backend&type=conventions)
  // or from CLI flags (--type, --tags)
  const filters = {};
  const urlObj = url.startsWith('contextd://')
    ? new URL(url.replace('contextd://', 'https://'))
    : new URL(url);
  const urlType = urlObj.searchParams.get('type');
  const urlTags = urlObj.searchParams.get('tags');
  if (options.type || urlType) filters.type = options.type || urlType;
  if (options.tags || urlTags) filters.tags = (options.tags || urlTags).split(',');

  // Store the URL without query params (filters live in sources.json)
  const cleanUrl = url.split('?')[0];

  config.sources.push({
    name,
    url: cleanUrl,
    filters: Object.keys(filters).length ? filters : undefined,
    last_synced: null,
  });

  await writeSourcesConfig(rootDir, config);
  console.log(chalk.green(`\n  ✓ Subscribed to ${name}`));
  console.log(chalk.gray('  Run contextd sync now to fetch contexts.\n'));
}

async function syncRemove(rootDir, name) {
  if (!name) {
    console.log(chalk.red('\n  Usage: contextd sync remove <name>\n'));
    process.exit(1);
  }

  const config = await loadSourcesConfig(rootDir);
  const before = config.sources.length;
  config.sources = config.sources.filter(s => s.name !== name);

  if (config.sources.length === before) {
    console.log(chalk.yellow(`\n  No subscription named ${name}\n`));
    return;
  }

  await writeSourcesConfig(rootDir, config);
  console.log(chalk.green(`\n  ✓ Removed ${name}\n`));
}

async function syncList(rootDir) {
  const config = await loadSourcesConfig(rootDir);
  if (config.sources.length === 0) {
    console.log(chalk.gray('\n  No remote sources. Add one with: contextd sync add <url>\n'));
    return;
  }
  console.log(chalk.bold('\n  Remote sources:\n'));
  for (const s of config.sources) {
    const age = s.last_synced
      ? chalk.gray(`(last synced ${new Date(s.last_synced).toLocaleDateString()})`)
      : chalk.yellow('(never synced)');
    console.log(`  ${chalk.cyan(s.name)} ${age}`);
    if (s.filters && Object.keys(s.filters).length) {
      console.log(chalk.gray(`    filters: ${JSON.stringify(s.filters)}`));
    }
  }
  console.log();
}

export async function syncNow(rootDir, options = {}) {
  const config = await loadSourcesConfig(rootDir);
  if (config.sources.length === 0) {
    if (!options.silent) console.log(chalk.gray('\n  No remote sources configured.\n'));
    return;
  }

  const token = await getToken();
  let updated = false;

  for (const source of config.sources) {
    const spinner = ora(`Syncing ${source.name}...`).start();
    try {
      const { synced, errors } = await syncSource(rootDir, source, token || undefined);
      source.last_synced = new Date().toISOString();
      spinner.succeed(chalk.green(`${source.name}: ${synced} contexts synced`));
      if (errors.length) {
        errors.forEach(e => console.log(chalk.yellow(`    ⚠ ${e}`)));
      }
      updated = true;
    } catch (err) {
      spinner.fail(`${source.name}: ${err.message}`);
    }
  }

  if (updated) await writeSourcesConfig(rootDir, config);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/commands/sync.js
git commit -m "feat(cli): add contextd sync add/remove/list/now commands"
```

---

## Task 10: `contextd sync publish`

**Files:**
- Modify: `packages/cli/src/commands/sync.js`

- [ ] **Step 1: Add `publish` to the switch in `syncCommand`**

In `packages/cli/src/commands/sync.js`, update the switch statement:

```javascript
switch (action) {
  case 'add': return syncAdd(rootDir, args[0], options);
  case 'remove': return syncRemove(rootDir, args[0]);
  case 'list': return syncList(rootDir);
  case 'now': return syncNow(rootDir, options);
  case 'publish': return syncPublish(rootDir, options);
  default:
    console.log(chalk.red(`\n  Unknown sync action: ${action}\n`));
    console.log(chalk.gray('  Available: add, remove, list, now, publish\n'));
    process.exit(1);
}
```

- [ ] **Step 2: Add the `syncPublish` function to `packages/cli/src/commands/sync.js`**

Add after `syncNow`:

```javascript
async function syncPublish(rootDir, options) {
  const token = await getToken();
  if (!token) {
    console.log(chalk.red('\n  ✗ Not authenticated. Run contextd auth login first.\n'));
    process.exit(1);
  }

  const { loadAllContext, parseSourceUrl } = await import('@danfarrdotcom/core');
  const ctx = await loadAllContext(rootDir);

  // Determine target org/collection from sources.json or --target flag
  const config = await loadSourcesConfig(rootDir);
  const targetName = options.target || config.sources.find(s => s.name)?.name;
  if (!targetName) {
    console.log(chalk.red('\n  ✗ No target. Add a source first or use --target org/collection\n'));
    process.exit(1);
  }

  const [org, collection] = targetName.split('/');
  const parsed = parseSourceUrl(`contextd://${org}/${collection}`);
  if (!parsed) {
    console.log(chalk.red(`\n  ✗ Invalid target: ${targetName}\n`));
    process.exit(1);
  }

  const apiBase = process.env.CONTEXTD_API_URL || 'https://contextd-worker.workers.dev/v1';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const toPublish = ctx.all.filter(c => !c.path.includes('/remote/'));
  let pushed = 0;
  let skipped = 0;

  console.log(chalk.bold(`\n  Publishing to ${targetName}${options.dryRun ? ' (dry run)' : ''}...\n`));

  for (const context of toPublish) {
    const slug = path.basename(context.path, '.md');
    const type = context.path.includes('/decisions/') ? 'decision'
      : context.path.includes('/modules/') ? 'module'
      : slug;

    if (options.dryRun) {
      console.log(chalk.gray(`  would push: ${slug} (${type})`));
      skipped++;
      continue;
    }

    const spinner = ora(`Pushing ${slug}...`).start();
    try {
      const res = await fetch(`${apiBase}/orgs/${org}/${collection}/contexts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug,
          type,
          title: context.meta.title,
          content: context.content,
          tags: context.meta.tags || [],
          scope: context.meta.scope || undefined,
          priority: context.meta.priority,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        spinner.fail(`${slug}: ${body.error || res.statusText}`);
      } else {
        spinner.succeed(chalk.green(slug));
        pushed++;
      }
    } catch (err) {
      spinner.fail(`${slug}: ${err.message}`);
    }
  }

  console.log(chalk.bold(`\n  Done. ${pushed} pushed, ${skipped} skipped.\n`));
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/sync.js
git commit -m "feat(cli): add contextd sync publish command"
```

---

## Task 11: Merge remote contexts in export and serve

**Files:**
- Modify: `packages/cli/src/commands/export.js`
- Modify: `packages/cli/src/commands/serve.js`

- [ ] **Step 1: Update `packages/cli/src/commands/export.js`**

Replace the import line and the `contexts` loading block:

```javascript
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  findRoot,
  loadAllContext,
  getRelevantContext,
  buildExportOutput,
  loadRemoteContexts,
  mergeContexts,
  loadSourcesConfig,
  shouldAutoRefresh,
} from '@danfarrdotcom/core';
import { syncNow } from './sync.js';
```

Replace the `contexts` loading block inside `exportCommand` (the try block):

```javascript
  try {
    // Auto-refresh stale remote sources in background
    const config = await loadSourcesConfig(rootDir);
    const stale = config.sources.filter(shouldAutoRefresh);
    if (stale.length) await syncNow(rootDir, { silent: true }).catch(() => {});

    // Warn if any source hasn't synced in >7 days
    const veryStale = config.sources.filter(s => {
      if (!s.last_synced) return false;
      const age = Date.now() - new Date(s.last_synced).getTime();
      return age > 7 * 24 * 60 * 60 * 1000;
    });
    if (veryStale.length) {
      veryStale.forEach(s => console.log(chalk.yellow(`  ⚠ Remote context ${s.name} hasn't synced in over 7 days`)));
    }

    const remoteContexts = await loadRemoteContexts(rootDir);

    let contexts;
    if (options.files) {
      const filePaths = options.files.split(',').map(f => f.trim());
      const local = await getRelevantContext(rootDir, filePaths);
      contexts = await mergeContexts(local, remoteContexts);
    } else {
      const ctx = await loadAllContext(rootDir);
      contexts = await mergeContexts(ctx.all, remoteContexts);
    }

    const output = buildExportOutput(contexts, format);
    // ... rest unchanged
```

- [ ] **Step 2: Update `packages/cli/src/commands/serve.js`**

Add to the imports at the top of `serveCommand`:

```javascript
import {
  findRoot,
  loadAllContext,
  getRelevantContext,
  loadRemoteContexts,
  mergeContexts,
  loadSourcesConfig,
  shouldAutoRefresh,
} from '@danfarrdotcom/core';
import { syncNow } from './sync.js';
```

Add auto-refresh immediately after `findRoot` check in `serveCommand`:

```javascript
  // Auto-refresh stale remote sources (non-blocking)
  const config = await loadSourcesConfig(rootDir);
  const stale = config.sources.filter(shouldAutoRefresh);
  if (stale.length) syncNow(rootDir, { silent: true }).catch(() => {});

  // Warn on very stale sources (>7 days)
  const veryStale = config.sources.filter(s => {
    if (!s.last_synced) return false;
    const age = Date.now() - new Date(s.last_synced).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  });
  if (veryStale.length) {
    veryStale.forEach(s => console.error(chalk.yellow(`  ⚠ Remote context ${s.name} hasn't synced in over 7 days`)));
  }
```

Update `get_project_overview` tool to merge remote contexts:

```javascript
  server.tool('get_project_overview', 'Get a high-level overview of the project', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const parts = [];
    const project = merged.find(c => c.path.endsWith('project.md'));
    const arch = merged.find(c => c.path.endsWith('architecture.md'));
    if (project) parts.push(project.content);
    if (arch) parts.push(`## Architecture\n\n${arch.content}`);
    return {
      content: [{ type: 'text', text: parts.join('\n\n---\n\n') || 'No project context found.' }],
    };
  });
```

Update `get_conventions` tool:

```javascript
  server.tool('get_conventions', 'Get coding conventions and standards for this project', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const conventions = merged.find(c => c.path.endsWith('conventions.md'));
    return {
      content: [{ type: 'text', text: conventions?.content || 'No conventions defined yet.' }],
    };
  });
```

Update `get_relevant_context` tool:

```javascript
  server.tool(
    'get_relevant_context',
    'Get context relevant to specific files or areas of the codebase',
    { files: z.array(z.string()).describe('List of file paths you are working with') },
    async ({ files }) => {
      const local = await getRelevantContext(rootDir, files);
      const remote = await loadRemoteContexts(rootDir);
      const merged = await mergeContexts(local, remote);
      const text = merged.map(c => c.content).join('\n\n---\n\n');
      return {
        content: [{ type: 'text', text: text || 'No relevant context found for those files.' }],
      };
    }
  );
```

Update `list_decisions` tool:

```javascript
  server.tool('list_decisions', 'List all architecture decisions (ADRs)', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const decisions = merged.filter(c => c.path.includes('/decisions/'));
    if (decisions.length === 0) {
      return { content: [{ type: 'text', text: 'No architecture decisions recorded.' }] };
    }
    const text = decisions.map(d => `## ${d.meta.title}\n${d.content}`).join('\n\n---\n\n');
    return { content: [{ type: 'text', text }] };
  });
```

Update `get_module_context` tool:

```javascript
  server.tool(
    'get_module_context',
    'Get context for a specific module or directory',
    { module: z.string().describe('Module name or path (e.g. "api", "ui", "payments")') },
    async ({ module: moduleName }) => {
      const ctx = await loadAllContext(rootDir);
      const remote = await loadRemoteContexts(rootDir);
      const merged = await mergeContexts(ctx.all, remote);
      const mod = merged.find(m =>
        m.meta.scope?.includes(moduleName) || m.path.includes(moduleName)
      );
      return {
        content: [{
          type: 'text',
          text: mod?.content || `No context found for module: ${moduleName}`,
        }],
      };
    }
  );
```

- [ ] **Step 3: Build core to pick up exported functions**

```bash
cd packages/core && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/export.js packages/cli/src/commands/serve.js
git commit -m "feat(cli): merge remote contexts in export and serve with auto-refresh"
```

---

## Task 12: Wire up CLI and update gitignore

**Files:**
- Modify: `packages/cli/src/cli.js`
- Modify: `.gitignore` (root)

- [ ] **Step 1: Update `packages/cli/src/cli.js`**

```javascript
#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { exportCommand } from './commands/export.js';
import { checkCommand } from './commands/check.js';
import { decisionCommand } from './commands/decision.js';
import { serveCommand } from './commands/serve.js';
import { authCommand } from './commands/auth.js';
import { syncCommand } from './commands/sync.js';

console.log(chalk.cyan.bold('\n  contextd') + chalk.gray(' — the context layer for AI development\n'));

program
  .name('contextd')
  .description('Manage AI context for your codebase')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize contextd in the current project')
  .option('--minimal', 'Create minimal config only')
  .action(initCommand);

program
  .command('export')
  .description('Export context to a specific AI tool format')
  .option('--format <format>', 'Output format: claude-md, cursorrules, mcp, raw', 'claude-md')
  .option('--output <path>', 'Output file path (defaults to format standard)')
  .option('--files <files>', 'Comma-separated list of files to get context for')
  .action(exportCommand);

program
  .command('check')
  .description('Check the health of your context files')
  .option('--fix', 'Auto-fix simple issues')
  .action(checkCommand);

program
  .command('decision')
  .description('Manage architecture decision records (ADRs)')
  .argument('<action>', 'Action: add, list, view')
  .argument('[title]', 'Decision title (for add)')
  .action(decisionCommand);

program
  .command('serve')
  .description('Start contextd as an MCP server')
  .option('--port <port>', 'Port to serve on', '3333')
  .action(serveCommand);

program
  .command('auth')
  .description('Authenticate with contextd remote')
  .argument('<action>', 'Action: login, logout')
  .action(authCommand);

program
  .command('sync')
  .description('Manage remote context sources')
  .argument('<action>', 'Action: add, remove, list, now, publish')
  .argument('[args...]', 'Additional arguments')
  .option('--type <type>', 'Filter by context type (for sync add)')
  .option('--tags <tags>', 'Comma-separated tag filter (for sync add)')
  .option('--target <target>', 'Target org/collection (for sync publish)')
  .option('--dry-run', 'Preview without pushing (for sync publish)')
  .action(syncCommand);

program.parse();
```

- [ ] **Step 2: Add `.context/remote/` to root `.gitignore`**

Open `.gitignore` at the root of `contextd-projects` and add:

```
# contextd remote cache
.context/remote/
```

- [ ] **Step 3: Verify CLI help shows new commands**

```bash
cd packages/cli && node src/cli.js --help
```

Expected: Shows `auth` and `sync` commands in the list.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli.js .gitignore
git commit -m "feat(cli): register auth and sync commands"
```

---

## Task 13: Deploy Worker and end-to-end smoke test

**Files:**
- Modify: `packages/worker/wrangler.toml` (update placeholder IDs)

- [ ] **Step 1: Create D1 database**

```bash
cd packages/worker && npx wrangler d1 create contextd
```

Copy the `database_id` from the output and replace the placeholder in `wrangler.toml`.

- [ ] **Step 2: Apply schema to D1**

```bash
npx wrangler d1 execute contextd --remote --file=src/db/schema.sql
```

Expected: `Successfully executed SQL`

- [ ] **Step 3: Create KV namespace**

```bash
npx wrangler kv namespace create contextd
```

Copy the `id` from the output and replace the KV placeholder in `wrangler.toml`.

- [ ] **Step 4: Deploy Worker**

```bash
npx wrangler deploy
```

Note the Worker URL (e.g. `https://contextd-worker.<account>.workers.dev`).

- [ ] **Step 5: Smoke test — create org and subscribe**

```bash
# Create org via curl
curl -s -X POST https://contextd-worker.<account>.workers.dev/v1/orgs \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","name":"Test Org","keyName":"local"}' | jq .
```

Expected: `{ "org": { "id": "test", "name": "Test Org" }, "key": "ctxd_..." }`

- [ ] **Step 6: Smoke test — full CLI flow**

```bash
# In a test project directory with contextd initialized:
node /path/to/contextd-projects/packages/cli/src/cli.js auth login
# Enter: test, local, (blank for new org) — use the key from step 5 if org exists

node /path/to/contextd-projects/packages/cli/src/cli.js sync publish --target test/test-collection
node /path/to/contextd-projects/packages/cli/src/cli.js sync add contextd://test/test-collection
node /path/to/contextd-projects/packages/cli/src/cli.js sync now
node /path/to/contextd-projects/packages/cli/src/cli.js export --format raw
```

Expected: Export output includes contexts from `.context/remote/test/test-collection/`.

- [ ] **Step 7: Commit wrangler.toml with real IDs**

```bash
git add packages/worker/wrangler.toml
git commit -m "feat(worker): add real D1 and KV binding IDs"
```
