# Remote Context Sync — Design Spec

**Date:** 2026-05-02  
**Status:** Approved

## Summary

Add remote context sync to contextd, allowing teams to publish and subscribe to shared context collections hosted on Cloudflare Workers + D1 + KV. Supports public and private collections, filtered subscriptions, and disk-cached sync with auto-refresh.

---

## Architecture

Three layers:

**1. Cloudflare Worker (API)**  
A single Worker handles all HTTP routes. API keys validated on every request via hashed token lookup in D1. Markdown content stored in KV, metadata (orgs, collections, contexts) in D1.

`contextd auth login` prompts for org slug and key name, calls `POST /v1/orgs` on first use (creates org + first key) or `POST /v1/orgs/:org/keys` for subsequent keys, then writes the returned plaintext key to `~/.contextd/config.json`. The plaintext key is only ever returned once.

**2. CLI (new commands added to existing)**  
```
contextd auth login          # generate + store API key in ~/.contextd/config.json
contextd auth logout

contextd sync add <url>      # subscribe: contextd://acme/eng or contextd://acme/eng?tags=backend&type=conventions
contextd sync remove <name>
contextd sync list
contextd sync now            # force refresh all subscriptions
contextd sync publish        # push local .context/ up to a remote collection
```

Remote contexts cached to `.context/remote/<org>/<collection>/` on disk. Gitignored by default.

**3. Auto-refresh**  
When `contextd serve` or `contextd export` runs, checks `last_synced` in `sources.json` — if older than 24h (configurable), triggers a background sync before serving.

**Data flow:**
```
contextd sync add → writes sources.json
contextd sync now → Worker API → D1 metadata + KV content → .context/remote/
contextd export   → merges local + .context/remote/, local wins conflicts
```

---

## Data Model

### D1 (metadata)

```sql
create table orgs (
  id         text primary key,  -- slug: "acme"
  name       text not null,
  created_at integer not null
);

create table api_keys (
  id          text primary key default (lower(hex(randomblob(16)))),
  org_id      text references orgs not null,
  key_hash    text unique not null,  -- bcrypt hash, never store plaintext
  name        text,
  created_at  integer not null
);

create table collections (
  id         text primary key default (lower(hex(randomblob(16)))),
  org_id     text references orgs not null,
  slug       text not null,
  name       text not null,
  is_public  boolean default false,
  updated_at integer not null,
  unique (org_id, slug)
);

create table contexts (
  id            text primary key default (lower(hex(randomblob(16)))),
  collection_id text references collections not null,
  slug          text not null,
  type          text not null,        -- project|architecture|conventions|decision|module
  title         text not null,
  tags          text not null default '[]',  -- JSON array
  scope         text,
  priority      text,
  version       integer default 1,
  updated_at    integer not null,
  unique (collection_id, slug)
);
```

### KV (content)

```
key:   context:{context_id}
value: raw markdown string
```

### Local `sources.json`

```json
{
  "sources": [
    {
      "name": "acme/eng",
      "url": "contextd://acme/eng",
      "filters": { "tags": ["backend"], "type": "conventions" },
      "last_synced": "2026-05-02T10:00:00Z"
    }
  ]
}
```

---

## API Routes

All routes prefixed `/v1`. Auth header: `Authorization: Bearer <api-key>` required for private collections and all write operations.

### Orgs & Auth
```
POST   /v1/orgs                       # create org + first api key
POST   /v1/orgs/:org/keys             # generate new api key
DELETE /v1/orgs/:org/keys/:id         # revoke key
```

### Collections
```
GET    /v1/:org/:collection           # collection metadata
POST   /v1/orgs/:org/collections      # create collection
PATCH  /v1/orgs/:org/:collection      # update (rename, toggle public)
DELETE /v1/orgs/:org/:collection      # delete
```

### Contexts
```
GET    /v1/:org/:collection/contexts              # list metadata (?type=&tags=)
GET    /v1/:org/:collection/contexts/:slug        # single context with content
POST   /v1/orgs/:org/:collection/contexts         # create/update (publish)
DELETE /v1/orgs/:org/:collection/contexts/:slug   # delete
```

### Sync
```
GET    /v1/:org/:collection/sync?since=<timestamp>  # contexts updated since last sync
```

The `since` param lets the CLI skip unchanged contexts and only download diffs.

---

## Error Handling

### API errors
```
401  missing or invalid api key
403  api key doesn't have access to this org/collection
404  org, collection, or context not found
409  slug already exists (on create)
422  invalid type, malformed tags, missing required fields
429  rate limited (Cloudflare handles automatically)
```

### CLI sync failures
- Network down → use cached `.context/remote/` silently, warn if cache is empty
- Partial sync failure → keep previously cached version, log which failed
- Cache missing → hard fail with: `"Run contextd sync now to fetch remote contexts"`

### Conflict resolution
- Same slug exists locally and remotely → local wins, no error
- Remote context deleted → removed from cache on next sync, local file unaffected

### Auto-refresh
- Runs in background on `serve`/`export` start — never blocks
- If refresh fails silently, stale cache is still served
- Staleness warning printed if cache is >7 days old

### Publish
- Diffs local `.context/` against remote — only pushes changed files
- Dry run: `contextd sync publish --dry-run`

---

## Testing Strategy

### Worker
- Vitest + `@cloudflare/vitest-pool-workers` (real Workers runtime)
- D1 and KV use in-process bindings, no mocking
- Test each route: auth validation, filter params, `since` delta sync

### CLI
- Unit tests for `sources.json` read/write, cache path resolution, conflict logic
- Integration tests spin up local Worker via Wrangler, run actual CLI commands against it
- No mocking the HTTP layer

### Manual checklist
```
□ contextd auth login → key stored in ~/.contextd/config.json
□ contextd sync add contextd://acme/eng → sources.json written
□ contextd sync now → .context/remote/ populated
□ contextd export → local + remote merged, local wins conflict
□ contextd serve → auto-refresh triggers if cache >24h old
□ contextd sync publish → only changed files pushed
□ offline → cached contexts served, warning printed
□ public collection → no auth header required
```

---

## Infrastructure

- **Platform:** Cloudflare Workers + D1 + KV
- **Estimated cost:** Free tier covers early usage; paying territory only at thousands of active orgs
- **Auth:** API key (hashed with bcrypt in D1), stored locally in `~/.contextd/config.json`
- **New package:** `packages/worker` — Cloudflare Worker source, Wrangler config, D1 migrations
