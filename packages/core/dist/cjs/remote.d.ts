import { ContextFile } from './context.js';
export declare const REMOTE_DIR: string;
export declare const SOURCES_FILE: string;
export interface SyncSource {
    name: string;
    url: string;
    filters?: {
        type?: string;
        tags?: string[];
    };
    last_synced: string | null;
}
export interface SourcesConfig {
    sources: SyncSource[];
}
export declare function loadSourcesConfig(rootDir: string): Promise<SourcesConfig>;
export declare function writeSourcesConfig(rootDir: string, config: SourcesConfig): Promise<void>;
export declare function loadRemoteContexts(rootDir: string): Promise<ContextFile[]>;
export declare function parseSourceUrl(url: string, defaultApiBase?: string): {
    org: string;
    collection: string;
    apiBase: string;
} | null;
export declare function syncSource(rootDir: string, source: SyncSource, token?: string): Promise<{
    synced: number;
    errors: string[];
}>;
export declare function shouldAutoRefresh(source: SyncSource): boolean;
export declare function mergeContexts(localContexts: ContextFile[], remoteContexts: ContextFile[]): Promise<ContextFile[]>;
//# sourceMappingURL=remote.d.ts.map