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
