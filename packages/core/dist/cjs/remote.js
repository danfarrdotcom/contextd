"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCES_FILE = exports.REMOTE_DIR = void 0;
exports.loadSourcesConfig = loadSourcesConfig;
exports.writeSourcesConfig = writeSourcesConfig;
exports.loadRemoteContexts = loadRemoteContexts;
exports.parseSourceUrl = parseSourceUrl;
exports.syncSource = syncSource;
exports.shouldAutoRefresh = shouldAutoRefresh;
exports.mergeContexts = mergeContexts;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
const context_js_1 = require("./context.js");
exports.REMOTE_DIR = path.join(context_js_1.CONTEXT_DIR, 'remote');
exports.SOURCES_FILE = path.join(context_js_1.CONTEXT_DIR, 'sources.json');
const AUTO_REFRESH_HOURS = 24;
async function loadSourcesConfig(rootDir) {
    const filePath = path.join(rootDir, exports.SOURCES_FILE);
    if (!await fs.pathExists(filePath))
        return { sources: [] };
    return fs.readJson(filePath);
}
async function writeSourcesConfig(rootDir, config) {
    const filePath = path.join(rootDir, exports.SOURCES_FILE);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, config, { spaces: 2 });
}
async function loadRemoteContexts(rootDir) {
    const remoteDir = path.join(rootDir, exports.REMOTE_DIR);
    if (!await fs.pathExists(remoteDir))
        return [];
    const files = await (0, glob_1.glob)('**/*.md', { cwd: remoteDir, absolute: true });
    return Promise.all(files.map(context_js_1.loadContextFile));
}
const DEFAULT_API_BASE = 'https://contextd-worker.dan-farr6298.workers.dev/v1';
function parseSourceUrl(url, defaultApiBase = DEFAULT_API_BASE) {
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
async function syncSource(rootDir, source, token) {
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
    const cacheDir = path.join(rootDir, exports.REMOTE_DIR, org, collection);
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
function shouldAutoRefresh(source) {
    if (!source.last_synced)
        return true;
    const age = Date.now() - new Date(source.last_synced).getTime();
    return age > AUTO_REFRESH_HOURS * 60 * 60 * 1000;
}
async function mergeContexts(localContexts, remoteContexts) {
    const localSlugs = new Set(localContexts.map(c => path.basename(c.path)));
    const uniqueRemote = remoteContexts.filter(c => !localSlugs.has(path.basename(c.path)));
    return [...localContexts, ...uniqueRemote];
}
//# sourceMappingURL=remote.js.map