export declare const CONTEXT_DIR = ".context";
export interface ContextMeta {
    title: string;
    tags: string[];
    priority: string;
    updated: string | null;
    scope: string | null;
    status?: string;
    date?: string;
    [key: string]: unknown;
}
export interface ContextFile {
    path: string;
    meta: ContextMeta;
    content: string;
}
export interface AllContext {
    project: ContextFile | undefined;
    architecture: ContextFile | undefined;
    conventions: ContextFile | undefined;
    decisions: ContextFile[];
    modules: ContextFile[];
    all: ContextFile[];
}
export interface ContextStats {
    total: number;
    decisions: number;
    modules: number;
    stale: string[];
    hasProject: boolean;
    hasArchitecture: boolean;
    hasConventions: boolean;
}
export declare function findRoot(startDir?: string): Promise<string | null>;
export declare function loadContextFile(filePath: string): Promise<ContextFile>;
export declare function loadAllContext(rootDir: string): Promise<AllContext>;
export declare function getRelevantContext(rootDir: string, filePaths?: string[]): Promise<ContextFile[]>;
export declare function getContextStats(rootDir: string): Promise<ContextStats>;
export declare function buildExportOutput(contexts: ContextFile[], format: string): string;
//# sourceMappingURL=context.d.ts.map