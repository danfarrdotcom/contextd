import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
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
