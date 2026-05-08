import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { CONTEXT_DIR, loadContextFile } from './context.js';
export const REMOTE_DIR = path.join(CONTEXT_DIR, 'remote');
export const SOURCES_FILE = path.join(CONTEXT_DIR, 'sources.json');
const AUTO_REFRESH_HOURS = 24;
export async function loadSourcesConfig(rootDir) {
    const filePath = path.join(rootDir, SOURCES_FILE);
    if (!await fs.pathExists(filePath))
        return { sources: [] };
    return fs.readJson(filePath);
}
export async function writeSourcesConfig(rootDir, config) {
    const filePath = path.join(rootDir, SOURCES_FILE);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, config, { spaces: 2 });
}
export async function loadRemoteContexts(rootDir) {
    const remoteDir = path.join(rootDir, REMOTE_DIR);
    if (!await fs.pathExists(remoteDir))
        return [];
    const files = await glob('**/*.md', { cwd: remoteDir, absolute: true });
    return Promise.all(files.map(loadContextFile));
}
const DEFAULT_API_BASE = 'https://contextd-worker.dan-farr6298.workers.dev/v1';
export function parseSourceUrl(url, defaultApiBase = DEFAULT_API_BASE) {
    // contextd://acme/eng -> <defaultApiBase>/acme/eng
    // https://my-worker.workers.dev/v1/acme/eng -> direct
    if (url.startsWith('contextd://')) {
        const rest = url.slice('contextd://'.length);
        const [org, collection] = rest.split('/');
        if (!org || !collection)
            return null;
        return { org, collection, apiBase: defaultApiBase };
    }
    if (url.startsWith('https://')) {
        const u = new URL(url);
        if (!u.pathname.includes('/v1/'))
            return null;
        const parts = u.pathname.replace('/v1/', '').split('/').filter(Boolean);
        if (parts.length < 2)
            return null;
        return { org: parts[0], collection: parts[1], apiBase: `${u.origin}/v1` };
    }
    return null;
}
export async function syncSource(rootDir, source, token) {
    const parsed = parseSourceUrl(source.url);
    if (!parsed)
        throw new Error(`Invalid source URL: ${source.url}`);
    const { org, collection, apiBase } = parsed;
    const since = source.last_synced ? new Date(source.last_synced).getTime() : undefined;
    const isFullSync = !since;
    const params = new URLSearchParams();
    if (since)
        params.set('since', String(since));
    if (source.filters?.type)
        params.set('type', source.filters.type);
    if (source.filters?.tags?.length)
        params.set('tags', source.filters.tags.join(','));
    const url = `${apiBase}/${org}/${collection}/sync?${params}`;
    const headers = {};
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sync failed (${res.status}): ${text}`);
    }
    const { contexts } = await res.json();
    const cacheDir = path.join(rootDir, REMOTE_DIR, org, collection);
    // On full sync (first time or forced), clear cache first so deleted remote contexts don't linger
    if (isFullSync && await fs.pathExists(cacheDir)) {
        await fs.emptyDir(cacheDir);
    }
    await fs.ensureDir(cacheDir);
    const errors = [];
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
        }
        catch (err) {
            errors.push(`Failed to write ${ctx.slug}: ${err.message}`);
        }
    }
    return { synced: contexts.length - errors.length, errors };
}
export function shouldAutoRefresh(source) {
    if (!source.last_synced)
        return true;
    const age = Date.now() - new Date(source.last_synced).getTime();
    return age > AUTO_REFRESH_HOURS * 60 * 60 * 1000;
}
export async function mergeContexts(localContexts, remoteContexts) {
    const localSlugs = new Set(localContexts.map(c => path.basename(c.path)));
    const uniqueRemote = remoteContexts.filter(c => !localSlugs.has(path.basename(c.path)));
    return [...localContexts, ...uniqueRemote];
}
//# sourceMappingURL=remote.js.map