# contextd Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine `contextd` (CLI) and `contextd-vscode` (VS Code extension) into a pnpm + Turborepo monorepo with a shared `@contextd/core` package and Changesets-based GitHub releases.

**Architecture:** Three packages under `packages/`: `core` (TypeScript, dual ESM+CJS), `cli` (JS/ESM, runs from source), `vscode` (TypeScript+esbuild). Turbo enforces build order so `core` always builds before `cli` and `vscode`. Changesets manages independent versioning; GitHub Actions automates publishing.

**Tech Stack:** pnpm 9 workspaces, Turborepo, Changesets, TypeScript 5.3, esbuild, @vscode/vsce, GitHub Actions

---

## File Map

### Created
- `package.json` — private root, workspace scripts
- `pnpm-workspace.yaml` — declares `packages/*`
- `turbo.json` — pipeline: build → type-check, dev, lint
- `.gitignore` — root ignore patterns
- `.changeset/config.json` — independent versioning config
- `packages/core/package.json` — `@contextd/core`, dual ESM+CJS
- `packages/core/tsconfig.json` — base TS config (ESM output + type-check)
- `packages/core/tsconfig.cjs.json` — CJS output config
- `packages/core/src/context.ts` — merged context logic (all functions + types)
- `packages/core/src/index.ts` — public re-exports
- `.github/workflows/ci.yml` — build + type-check on every PR
- `.github/workflows/release.yml` — Changesets publish + vscode .vsix release

### Moved
- `contextd/` → `packages/cli/`
- `contextd-vscode/` → `packages/vscode/`

### Modified
- `packages/cli/package.json` — add `@contextd/core: workspace:*`, add `build` script
- `packages/cli/src/commands/export.js` — import `buildExportOutput` from `@contextd/core`, remove local `buildOutput`
- `packages/cli/src/commands/check.js` — update import path
- `packages/cli/src/commands/init.js` — update import path
- `packages/cli/src/commands/decision.js` — update import path
- `packages/cli/src/commands/serve.js` — update import path
- `packages/vscode/package.json` — rename to `contextd-vscode`, add `@contextd/core: workspace:*`, add `@vscode/vsce` devDep
- `packages/vscode/src/extension.ts` — update import from `'./context'` to `'@contextd/core'`
- `packages/vscode/src/treeProvider.ts` — update import from `'./context'` to `'@contextd/core'`
- `packages/vscode/src/healthView.ts` — update import from `'./context'` to `'@contextd/core'`

### Deleted
- `packages/cli/src/core/context.js` — replaced by `@contextd/core`
- `packages/vscode/src/context.ts` — replaced by `@contextd/core`
- `packages/cli/node_modules/` — reinstalled by pnpm workspaces
- `packages/vscode/node_modules/` — reinstalled by pnpm workspaces
- `packages/cli/package-lock.json` — replaced by root `pnpm-lock.yaml`
- `packages/vscode/package-lock.json` — replaced by root `pnpm-lock.yaml`

---

## Task 1: Scaffold monorepo root config files

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "contextd-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "type-check": "turbo type-check"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "turbo": "latest"
  }
}
```

Save to: `package.json` (repo root)

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

Save to: `pnpm-workspace.yaml`

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

Save to: `turbo.json`

- [ ] **Step 4: Create root `.gitignore`**

```
node_modules/
.turbo/
dist/
out/
*.vsix
.env
.DS_Store
```

Save to: `.gitignore`

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore
git commit -m "chore: add monorepo root config (turbo + pnpm workspaces)"
```

---

## Task 2: Move existing projects into packages/

**Files:**
- Move: `contextd/` → `packages/cli/`
- Move: `contextd-vscode/` → `packages/vscode/`

- [ ] **Step 1: Create packages/ directory and move projects**

```bash
mkdir -p packages
mv contextd packages/cli
mv contextd-vscode packages/vscode
```

- [ ] **Step 2: Remove old lock files and node_modules** (pnpm will reinstall everything from root)

```bash
rm -f packages/cli/package-lock.json packages/vscode/package-lock.json
rm -rf packages/cli/node_modules packages/vscode/node_modules
```

- [ ] **Step 3: Verify structure**

```bash
ls packages/
# Expected output:
# cli  vscode
ls packages/cli/src/
# Expected: cli.js  commands/  core/
ls packages/vscode/src/
# Expected: context.ts  extension.ts  healthView.ts  treeProvider.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/
git commit -m "chore: move cli and vscode into packages/ directory"
```

---

## Task 3: Create @contextd/core package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsconfig.cjs.json`
- Create: `packages/core/src/context.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@contextd/core",
  "version": "0.1.0",
  "description": "Shared context logic for contextd tools",
  "type": "module",
  "main": "./dist/esm/index.js",
  "types": "./dist/esm/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/esm/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.cjs.json",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "fs-extra": "^11.2.0",
    "glob": "^10.3.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  },
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`** (ESM output + used for type-check)

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist/esm"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/tsconfig.cjs.json`** (CJS output for VS Code extension)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "dist/cjs"
  }
}
```

- [ ] **Step 4: Create `packages/core/src/context.ts`**

This merges `packages/cli/src/core/context.js` (JS logic) with `packages/vscode/src/context.ts` (TypeScript types). The `findRoot` parameter is optional (default `process.cwd()`) to support both the CLI (which omits it) and the extension (which passes `workspaceRoot`). The `buildExportOutput` function uses format-aware headers to support both `claude-md` and `cursorrules` formats.

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

export const CONTEXT_DIR = '.context';

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

export async function findRoot(startDir: string = process.cwd()): Promise<string | null> {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (await fs.pathExists(path.join(dir, CONTEXT_DIR))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

export async function loadContextFile(filePath: string): Promise<ContextFile> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const { data: meta, content } = matter(raw);
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

export async function loadAllContext(rootDir: string): Promise<AllContext> {
  const contextDir = path.join(rootDir, CONTEXT_DIR);

  if (!await fs.pathExists(contextDir)) {
    throw new Error(`No .context/ directory found. Run 'contextd init' first.`);
  }

  const files = await glob('**/*.md', { cwd: contextDir, absolute: true });
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

export async function getRelevantContext(rootDir: string, filePaths: string[] = []): Promise<ContextFile[]> {
  const ctx = await loadAllContext(rootDir);
  const relevant: ContextFile[] = [];

  if (ctx.project) relevant.push(ctx.project);
  if (ctx.architecture && filePaths.length > 0) relevant.push(ctx.architecture);
  if (ctx.conventions) relevant.push(ctx.conventions);

  for (const mod of ctx.modules) {
    const modScope = mod.meta.scope;
    if (!modScope) continue;
    if (filePaths.some(f => f.includes(modScope))) relevant.push(mod);
  }

  for (const decision of ctx.decisions) {
    if (decision.meta.tags.length === 0) {
      relevant.push(decision);
      continue;
    }
    const pathStr = filePaths.join(' ');
    if (decision.meta.tags.some((tag: string) => pathStr.includes(tag))) {
      relevant.push(decision);
    }
  }

  return relevant;
}

export async function getContextStats(rootDir: string): Promise<ContextStats> {
  const ctx = await loadAllContext(rootDir);
  const now = new Date();

  const stale = ctx.all.filter(c => {
    if (!c.meta.updated) return true;
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

export function buildExportOutput(contexts: ContextFile[], format: string): string {
  const sections: string[] = [];
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

  const seen = new Set<string>();
  const unique = ordered.filter(c => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });

  for (const ctx of unique) {
    if (!ctx.content) continue;
    if (ctx.path.includes('/decisions/')) {
      sections.push(`\n---\n\n## Decision: ${ctx.meta.title}\n\n${ctx.content}`);
    } else if (ctx.path.includes('/modules/')) {
      sections.push(`\n---\n\n## Module Context: ${ctx.meta.scope || ctx.meta.title}\n\n${ctx.content}`);
    } else {
      sections.push(`\n---\n\n${ctx.content}`);
    }
  }

  return sections.join('\n');
}
```

- [ ] **Step 5: Create `packages/core/src/index.ts`**

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
```

Note: the `.js` extension in the import path is required for ESM TypeScript (tsc resolves `.ts` files by their future `.js` output path).

- [ ] **Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat: add @contextd/core shared package with merged context logic"
```

---

## Task 4: Update CLI package to use @contextd/core

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/commands/init.js`
- Modify: `packages/cli/src/commands/export.js`
- Modify: `packages/cli/src/commands/check.js`
- Modify: `packages/cli/src/commands/decision.js`
- Modify: `packages/cli/src/commands/serve.js`
- Delete: `packages/cli/src/core/context.js`

- [ ] **Step 1: Update `packages/cli/package.json`**

Add `@contextd/core: workspace:*` to dependencies and add a no-op `build` script so Turbo can complete the pipeline:

```json
{
  "name": "contextd",
  "version": "0.1.0",
  "description": "The context layer for AI-assisted development",
  "type": "module",
  "main": "src/index.js",
  "bin": {
    "contextd": "./src/cli.js"
  },
  "scripts": {
    "start": "node src/cli.js",
    "dev": "node --watch src/cli.js",
    "build": "echo 'CLI runs from source, no build step needed'"
  },
  "keywords": ["ai", "context", "claude", "cursor", "mcp", "developer-tools"],
  "license": "MIT",
  "dependencies": {
    "@contextd/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "chalk": "^5.3.0",
    "chokidar": "^3.6.0",
    "commander": "^12.0.0",
    "fs-extra": "^11.2.0",
    "glob": "^10.3.0",
    "gray-matter": "^4.0.3",
    "ora": "^8.0.1",
    "zod": "^3.22.0"
  }
}
```

- [ ] **Step 2: Update `packages/cli/src/commands/init.js`** — change import

Replace line 5:
```js
import { CONTEXT_DIR, findRoot } from '../core/context.js';
```
With:
```js
import { CONTEXT_DIR, findRoot } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 3: Update `packages/cli/src/commands/check.js`** — change import

Replace line 4:
```js
import { findRoot, getContextStats, loadAllContext } from '../core/context.js';
```
With:
```js
import { findRoot, getContextStats, loadAllContext } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 4: Update `packages/cli/src/commands/decision.js`** — change import

Replace line 6:
```js
import { findRoot, CONTEXT_DIR } from '../core/context.js';
```
With:
```js
import { findRoot, CONTEXT_DIR } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 5: Update `packages/cli/src/commands/serve.js`** — change import

Replace line 2:
```js
import { findRoot, loadAllContext, getRelevantContext } from '../core/context.js';
```
With:
```js
import { findRoot, loadAllContext, getRelevantContext } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 6: Update `packages/cli/src/commands/export.js`** — change import and remove local `buildOutput`

Replace the entire file content with:

```js
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findRoot, loadAllContext, getRelevantContext, buildExportOutput } from '@contextd/core';

const FORMATS = {
  'claude-md': { file: 'CLAUDE.md', label: 'CLAUDE.md (Claude Code)' },
  'cursorrules': { file: '.cursorrules', label: '.cursorrules (Cursor)' },
  'raw': { file: null, label: 'Raw output' },
  'mcp': { file: null, label: 'MCP (served live via contextd serve)' },
};

export async function exportCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  const format = options.format;
  if (!FORMATS[format]) {
    console.log(chalk.red(`\n  ✗ Unknown format: ${format}`));
    console.log(chalk.gray(`  Available: ${Object.keys(FORMATS).join(', ')}\n`));
    process.exit(1);
  }

  if (format === 'mcp') {
    console.log(chalk.yellow('\n  For MCP, run: contextd serve\n'));
    return;
  }

  const spinner = ora(`Exporting as ${FORMATS[format].label}...`).start();

  try {
    let contexts;
    if (options.files) {
      const filePaths = options.files.split(',').map(f => f.trim());
      contexts = await getRelevantContext(rootDir, filePaths);
    } else {
      const ctx = await loadAllContext(rootDir);
      contexts = ctx.all;
    }

    const output = buildExportOutput(contexts, format);

    if (format === 'raw') {
      spinner.stop();
      console.log(output);
      return;
    }

    const outFile = options.output || path.join(rootDir, FORMATS[format].file);
    await fs.writeFile(outFile, output);

    spinner.succeed(chalk.green(`Exported to ${path.relative(process.cwd(), outFile)}`));

    const lines = output.split('\n').length;
    const chars = output.length;
    console.log(chalk.gray(`\n  ${lines} lines · ${chars} chars · ${contexts.length} context files merged\n`));

  } catch (err) {
    spinner.fail('Export failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}
```

- [ ] **Step 7: Delete the now-redundant context file**

```bash
rm -rf packages/cli/src/core/
```

- [ ] **Step 8: Verify no remaining local imports**

```bash
grep -r 'core/context' packages/cli/src/
# Expected: no output (all imports now use @contextd/core)
```

- [ ] **Step 9: Commit**

```bash
git add packages/cli/
git commit -m "feat: migrate cli to @contextd/core, remove local context.js"
```

---

## Task 5: Update vscode extension to use @contextd/core

**Files:**
- Modify: `packages/vscode/package.json`
- Modify: `packages/vscode/src/extension.ts`
- Modify: `packages/vscode/src/treeProvider.ts`
- Modify: `packages/vscode/src/healthView.ts`
- Delete: `packages/vscode/src/context.ts`

- [ ] **Step 1: Update `packages/vscode/package.json`**

Key changes: rename from `"contextd"` to `"contextd-vscode"`, add `@contextd/core: workspace:*` dependency, add `@vscode/vsce` devDependency, add `type-check` script:

```json
{
  "name": "contextd-vscode",
  "displayName": "contextd",
  "description": "The context layer for AI-assisted development",
  "version": "0.1.0",
  "publisher": "contextd",
  "private": true,
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "AI"],
  "keywords": ["ai", "context", "claude", "cursor", "copilot", "mcp"],
  "activationEvents": ["workspaceContains:.context/project.md", "onCommand:contextd.init"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      { "command": "contextd.init", "title": "contextd: Initialize in this project", "icon": "$(add)" },
      { "command": "contextd.export", "title": "contextd: Export context", "icon": "$(export)" },
      { "command": "contextd.check", "title": "contextd: Check context health", "icon": "$(pulse)" },
      { "command": "contextd.addDecision", "title": "contextd: Add architecture decision (ADR)", "icon": "$(git-commit)" },
      { "command": "contextd.openFile", "title": "Open file", "icon": "$(go-to-file)" },
      { "command": "contextd.refreshTree", "title": "Refresh", "icon": "$(refresh)" },
      { "command": "contextd.addModuleContext", "title": "contextd: Add module context for current file", "icon": "$(file-add)" },
      { "command": "contextd.copyContextForFile", "title": "contextd: Copy relevant context to clipboard", "icon": "$(clippy)" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "contextd", "title": "contextd", "icon": "assets/icon-mono.svg" }
      ]
    },
    "views": {
      "contextd": [
        { "id": "contextd.contextTree", "name": "Context Files" },
        { "id": "contextd.healthView", "name": "Health" }
      ]
    },
    "menus": {
      "view/title": [
        { "command": "contextd.refreshTree", "when": "view == contextd.contextTree", "group": "navigation" },
        { "command": "contextd.export", "when": "view == contextd.contextTree", "group": "navigation" },
        { "command": "contextd.addDecision", "when": "view == contextd.contextTree", "group": "navigation" }
      ],
      "view/item/context": [
        { "command": "contextd.openFile", "when": "viewItem == contextFile", "group": "inline" }
      ],
      "editor/context": [
        { "command": "contextd.copyContextForFile", "group": "contextd", "when": "resourceExtname != ''" },
        { "command": "contextd.addModuleContext", "group": "contextd" }
      ]
    },
    "configuration": {
      "title": "contextd",
      "properties": {
        "contextd.autoExportOnSave": { "type": "boolean", "default": false, "description": "Automatically re-export when context files change" },
        "contextd.defaultExportFormat": { "type": "string", "default": "claude-md", "enum": ["claude-md", "cursorrules", "raw"], "description": "Default export format" },
        "contextd.showStatusBar": { "type": "boolean", "default": true, "description": "Show contextd status in the status bar" }
      }
    }
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node --minify",
    "build:dev": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node --sourcemap",
    "watch": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node --sourcemap --watch",
    "package": "vsce package",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  },
  "dependencies": {
    "@contextd/core": "workspace:*",
    "fs-extra": "^11.2.0",
    "glob": "^10.3.0",
    "gray-matter": "^4.0.3"
  }
}
```

- [ ] **Step 2: Update `packages/vscode/src/extension.ts`** — change import

Replace lines 6-13:
```typescript
import {
  findRoot,
  loadAllContext,
  getRelevantContext,
  buildExportOutput,
  CONTEXT_DIR,
} from './context';
```
With:
```typescript
import {
  findRoot,
  loadAllContext,
  getRelevantContext,
  buildExportOutput,
  CONTEXT_DIR,
} from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 3: Update `packages/vscode/src/treeProvider.ts`** — change import

Replace line 4:
```typescript
import { loadAllContext, AllContext, ContextFile } from './context';
```
With:
```typescript
import { loadAllContext, AllContext, ContextFile } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 4: Update `packages/vscode/src/healthView.ts`** — change import

Replace line 4:
```typescript
import { getContextStats, loadAllContext, ContextStats } from './context';
```
With:
```typescript
import { getContextStats, loadAllContext, ContextStats } from '@contextd/core';
```

No other changes needed in this file.

- [ ] **Step 5: Delete the now-redundant vscode context file**

```bash
rm packages/vscode/src/context.ts
```

- [ ] **Step 6: Verify no remaining local context imports in vscode**

```bash
grep -r "from './context'" packages/vscode/src/
# Expected: no output
```

- [ ] **Step 7: Commit**

```bash
git add packages/vscode/
git commit -m "feat: migrate vscode extension to @contextd/core, remove local context.ts"
```

---

## Task 6: Configure Changesets

**Files:**
- Create: `.changeset/config.json`

- [ ] **Step 1: Create `.changeset/config.json`**

Packages are versioned independently (no `fixed` groups). `updateInternalDependencies: "patch"` means when `@contextd/core` releases, cli and vscode get a patch bump automatically.

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/
git commit -m "chore: configure changesets for independent versioning"
```

---

## Task 7: Install dependencies and verify build

- [ ] **Step 1: Install pnpm if not already available**

```bash
npm install -g pnpm@9
pnpm --version
# Expected: 9.x.x
```

- [ ] **Step 2: Install all workspace dependencies from repo root**

```bash
pnpm install
# Expected: packages installed, pnpm-lock.yaml created, workspace symlinks set up
# You should see @contextd/core linked into packages/cli/node_modules and packages/vscode/node_modules
```

- [ ] **Step 3: Verify @contextd/core is linked**

```bash
ls packages/cli/node_modules/@contextd/
# Expected: core -> ../../../core  (symlink)
ls packages/vscode/node_modules/@contextd/
# Expected: core -> ../../../core  (symlink)
```

- [ ] **Step 4: Build @contextd/core**

```bash
cd packages/core && pnpm build
# Expected:
# tsc -p tsconfig.json (ESM output to dist/esm/)
# tsc -p tsconfig.cjs.json (CJS output to dist/cjs/)
# No errors
```

- [ ] **Step 5: Verify core build outputs**

```bash
ls packages/core/dist/esm/
# Expected: context.js  context.d.ts  context.d.ts.map  index.js  index.d.ts  index.d.ts.map
ls packages/core/dist/cjs/
# Expected: context.js  context.d.ts  index.js  index.d.ts
```

- [ ] **Step 6: Build all packages with Turbo from repo root**

```bash
cd /Users/drfarr/code/contextd-projects
pnpm build
# Expected: turbo runs core first, then cli and vscode in parallel
# cli: echo 'CLI runs from source, no build step needed'
# vscode: esbuild bundles to out/extension.js
# No errors
```

- [ ] **Step 7: Type-check all packages**

```bash
pnpm type-check
# Expected: turbo runs type-check on core and vscode
# No TypeScript errors
```

- [ ] **Step 8: Smoke-test the CLI**

```bash
node packages/cli/src/cli.js --help
# Expected: contextd help output with available commands listed
```

- [ ] **Step 9: Commit lock file and any generated files**

```bash
git add pnpm-lock.yaml packages/core/dist/
git commit -m "chore: install workspace deps and verify build"
```

Note: `packages/core/dist/` is committed so the CLI can resolve `@contextd/core` without a build step in development. If you prefer not to commit build artifacts, add `packages/core/dist/` to `.gitignore` and require `pnpm build` before `pnpm dev`.

---

## Task 8: GitHub Actions — CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    name: Build & Type-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Type-check
        run: pnpm type-check
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add CI workflow (build + type-check on every PR)"
```

---

## Task 9: GitHub Actions — Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

This workflow does two things:
1. When commits land on `main` with `.changeset/` files → opens/updates a "Version Packages" PR via `changesets/action`
2. When the "Version Packages" PR is merged → publishes `@contextd/core` and `contextd` to npm, creates GitHub releases for each. A second job then builds and attaches the `.vsix` to a vscode GitHub release.

The vscode package is `private: true` so changesets skips npm publish for it. The `release-vscode` job independently detects a version bump and creates its own GitHub release.

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Publish to npm
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  release-vscode:
    name: Release VS Code Extension
    runs-on: ubuntu-latest
    needs: release
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build core (required before vscode build)
        run: pnpm --filter @contextd/core build

      - name: Check if vscode version tag already exists
        id: version-check
        run: |
          VERSION=$(node -p "require('./packages/vscode/package.json').version")
          TAG="contextd-vscode@${VERSION}"
          if git ls-remote --tags origin | grep -qF "refs/tags/${TAG}"; then
            echo "skip=true" >> $GITHUB_OUTPUT
          else
            echo "skip=false" >> $GITHUB_OUTPUT
            echo "version=${VERSION}" >> $GITHUB_OUTPUT
            echo "tag=${TAG}" >> $GITHUB_OUTPUT
          fi

      - name: Build and publish vscode release
        if: steps.version-check.outputs.skip == 'false'
        run: |
          cd packages/vscode
          pnpm build
          pnpm package
          VERSION="${{ steps.version-check.outputs.version }}"
          TAG="${{ steps.version-check.outputs.tag }}"
          gh release create "$TAG" \
            --title "contextd VS Code v${VERSION}" \
            --generate-notes \
            "contextd-${VERSION}.vsix#VS Code Extension (.vsix)"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow (Changesets + vscode .vsix GitHub release)"
```

---

## Task 10: Required GitHub secrets and final push

- [ ] **Step 1: Add `NPM_TOKEN` secret to GitHub repo**

In the GitHub repo settings → Secrets → Actions → New repository secret:
- Name: `NPM_TOKEN`
- Value: your npm access token (generate at npmjs.com → Access Tokens → Granular token with publish permission for `contextd` and `@contextd/core`)

The `GITHUB_TOKEN` secret is provided automatically by GitHub Actions — no action needed.

- [ ] **Step 2: Push all commits to main**

```bash
git push origin main
```

Expected: all commits pushed. CI workflow triggers. Go to `https://github.com/danfarrdotcom/contextd/actions` to watch it run.

- [ ] **Step 3: Verify CI passes**

Open the Actions tab on GitHub. The "CI" workflow should show green for Build & Type-check.

- [ ] **Step 4: Add initial changeset for the first release**

```bash
pnpm changeset
```

This opens an interactive prompt:
1. Select all three packages with spacebar: `@contextd/core`, `contextd`, `contextd-vscode`
2. Choose bump type: `minor` for each (first real release)
3. Write summary: `Initial monorepo release — packages extracted from contextd-projects`

A new file appears in `.changeset/`. Commit and push it:

```bash
git add .changeset/
git commit -m "chore: add initial changeset for first monorepo release"
git push origin main
```

- [ ] **Step 5: Verify Changesets bot opens "Version Packages" PR**

After the push, the release workflow runs and `changesets/action` opens a PR titled "Version Packages". Check `https://github.com/danfarrdotcom/contextd/pulls`.

When you're ready to release, merge that PR. The release workflow will then:
- Publish `@contextd/core@0.1.0` and `contextd@0.1.0` to npm
- Create GitHub releases tagged `@contextd/core@0.1.0` and `contextd@0.1.0`
- Detect the vscode version bump and create a release tagged `contextd-vscode@0.1.0` with the `.vsix` attached

---

## Self-review

**Spec coverage check:**
- ✅ Repo structure: Tasks 1–2 scaffold root + move packages
- ✅ @contextd/core with dual ESM+CJS: Task 3
- ✅ CLI migrated to @contextd/core: Task 4
- ✅ vscode migrated to @contextd/core: Task 5
- ✅ Changesets independent versioning: Task 6
- ✅ pnpm install + build verification: Task 7
- ✅ CI workflow: Task 8
- ✅ Release workflow with npm + vscode .vsix: Task 9
- ✅ NPM_TOKEN secret + push: Task 10
- ✅ Turborepo pipeline with correct dependsOn: turbo.json in Task 1
- ✅ exports map with import/require conditions: core package.json in Task 3

**Out-of-scope confirmed not included:**
- VS Code Marketplace automated publishing: not in plan
- Standalone binary distribution: not in plan
- Turborepo remote cache: not in plan
- Testing infrastructure: not in plan
