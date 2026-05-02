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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTEXT_DIR = void 0;
exports.findRoot = findRoot;
exports.loadContextFile = loadContextFile;
exports.loadAllContext = loadAllContext;
exports.getRelevantContext = getRelevantContext;
exports.getContextStats = getContextStats;
exports.buildExportOutput = buildExportOutput;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
const gray_matter_1 = __importDefault(require("gray-matter"));
exports.CONTEXT_DIR = '.context';
async function findRoot(startDir = process.cwd()) {
    let dir = startDir;
    while (dir !== path.parse(dir).root) {
        if (await fs.pathExists(path.join(dir, exports.CONTEXT_DIR))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return null;
}
async function loadContextFile(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');
    const { data: meta, content } = (0, gray_matter_1.default)(raw);
    return {
        path: filePath,
        meta: {
            title: meta.title || path.basename(filePath, '.md'),
            tags: meta.tags || [],
            priority: meta.priority || 'normal',
            updated: meta.updated || null,
            scope: meta.scope || null,
            ...meta,
        },
        content: content.trim(),
    };
}
async function loadAllContext(rootDir) {
    const contextDir = path.join(rootDir, exports.CONTEXT_DIR);
    if (!await fs.pathExists(contextDir)) {
        throw new Error(`No .context/ directory found. Run 'contextd init' first.`);
    }
    const files = await (0, glob_1.glob)('**/*.md', { cwd: contextDir, absolute: true });
    const contexts = await Promise.all(files.map(loadContextFile));
    return {
        project: contexts.find(c => c.path.endsWith('project.md')),
        architecture: contexts.find(c => c.path.endsWith('architecture.md')),
        conventions: contexts.find(c => c.path.endsWith('conventions.md')),
        decisions: contexts.filter(c => c.path.includes('/decisions/')),
        modules: contexts.filter(c => c.path.includes('/modules/')),
        all: contexts,
    };
}
async function getRelevantContext(rootDir, filePaths = []) {
    const ctx = await loadAllContext(rootDir);
    const relevant = [];
    if (ctx.project)
        relevant.push(ctx.project);
    if (ctx.architecture && filePaths.length > 0)
        relevant.push(ctx.architecture);
    if (ctx.conventions)
        relevant.push(ctx.conventions);
    for (const mod of ctx.modules) {
        const modScope = mod.meta.scope;
        if (!modScope)
            continue;
        if (filePaths.some(f => f.includes(modScope)))
            relevant.push(mod);
    }
    for (const decision of ctx.decisions) {
        if (decision.meta.tags.length === 0) {
            relevant.push(decision);
            continue;
        }
        const pathStr = filePaths.join(' ');
        if (decision.meta.tags.some((tag) => pathStr.includes(tag))) {
            relevant.push(decision);
        }
    }
    return relevant;
}
async function getContextStats(rootDir) {
    const ctx = await loadAllContext(rootDir);
    const now = new Date();
    const stale = ctx.all.filter(c => {
        if (!c.meta.updated)
            return true;
        const updated = new Date(c.meta.updated);
        const monthsOld = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsOld > 3;
    });
    return {
        total: ctx.all.length,
        decisions: ctx.decisions.length,
        modules: ctx.modules.length,
        stale: stale.map(c => c.path),
        hasProject: !!ctx.project,
        hasArchitecture: !!ctx.architecture,
        hasConventions: !!ctx.conventions,
    };
}
function buildExportOutput(contexts, format) {
    const sections = [];
    const now = new Date().toISOString();
    const header = format === 'claude-md'
        ? `# Project Context\n\n> Generated by contextd on ${now}\n> Edit files in .context/ — do not edit this file directly.\n`
        : `# AI Context\n# Generated by contextd on ${now}\n# Edit files in .context/ — do not edit this file directly.\n`;
    sections.push(header);
    const ordered = [
        ...contexts.filter(c => c.path.endsWith('project.md')),
        ...contexts.filter(c => c.path.endsWith('architecture.md')),
        ...contexts.filter(c => c.path.endsWith('conventions.md')),
        ...contexts.filter(c => c.path.includes('/modules/')),
        ...contexts.filter(c => c.path.includes('/decisions/')),
    ];
    const seen = new Set();
    const unique = ordered.filter(c => {
        if (seen.has(c.path))
            return false;
        seen.add(c.path);
        return true;
    });
    for (const ctx of unique) {
        if (!ctx.content)
            continue;
        if (ctx.path.includes('/decisions/')) {
            sections.push(`\n---\n\n## Decision: ${ctx.meta.title}\n\n${ctx.content}`);
        }
        else if (ctx.path.includes('/modules/')) {
            sections.push(`\n---\n\n## Module Context: ${ctx.meta.scope || ctx.meta.title}\n\n${ctx.content}`);
        }
        else {
            sections.push(`\n---\n\n${ctx.content}`);
        }
    }
    return sections.join('\n');
}
//# sourceMappingURL=context.js.map