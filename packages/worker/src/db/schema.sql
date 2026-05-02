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
