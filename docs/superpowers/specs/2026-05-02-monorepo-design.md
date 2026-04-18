# contextd Monorepo Design

**Date:** 2026-05-02  
**Status:** Approved  
**Scope:** Combine `contextd` (CLI) and `contextd-vscode` (VS Code extension) into a single high-performance monorepo with automated GitHub releases.

---

## Goals

- Eliminate duplicated context-loading logic shared between the CLI and extension
- Co-locate both packages under a single repo with unified tooling
- Automate versioning, changelogs, npm publishing, and GitHub releases
- Keep independent release cadences per package

---

## Repository Structure

```
contextd-projects/           ← repo root
├── packages/
│   ├── core/                # @contextd/core — shared TypeScript logic
│   │   ├── src/
│   │   │   ├── context.ts   # merged from cli/src/core/context.js + vscode/src/context.ts
│   │   │   └── index.ts     # public API surface
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cli/                 # contextd npm binary
│   │   ├── src/
│   │   │   ├── cli.js       # entry point (JS/ESM, unchanged)
│   │   │   └── commands/    # init, export, check, decision, serve
│   │   └── package.json
│   └── vscode/              # contextd VS Code extension
│       ├── src/
│       │   ├── extension.ts
│       │   ├── treeProvider.ts
│       │   └── healthView.ts
│       ├── assets/
│       └── package.json
├── .changeset/
│   └── config.json
├── turbo.json
├── pnpm-workspace.yaml
├── package.json             # private root, scripts only
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

---

## Toolchain

| Tool | Version | Purpose |
|---|---|---|
| pnpm | 9.x | Package manager with strict workspace isolation |
| Turborepo | latest | Cached, parallel task orchestration |
| Changesets | latest | Independent per-package versioning and changelogs |
| TypeScript | 5.3+ | Shared across all packages |
| esbuild | 0.20+ | VS Code extension bundling (unchanged) |

---

## Packages

### `@contextd/core`

- **Language:** TypeScript, strict mode
- **Output:** dual ESM (`dist/esm/`) + CJS (`dist/cjs/`) via `tsc`, plus `.d.ts` declarations
- **Exports map:**
  ```json
  {
    "exports": {
      ".": {
        "import": "./dist/esm/index.js",
        "require": "./dist/cjs/index.js"
      }
    }
  }
  ```
- **Contents:** merged `context.js`/`context.ts` — context loading, file parsing, export formatting, health checks
- **Consumers:** `cli` (ESM import) and `vscode` (CJS require)
- **Published to:** npm as `@contextd/core`

### `contextd` (CLI)

- **Language:** JavaScript ES Modules (unchanged)
- **Entry:** `src/cli.js` with `#!/usr/bin/env node` shebang
- **Build:** none — runs directly from source
- **Dependency on core:** `"@contextd/core": "workspace:*"`
- **Published to:** npm as `contextd`
- **Distribution:** npm only (`npm install -g contextd`)

### `contextd-vscode`

- **Language:** TypeScript → CommonJS via esbuild
- **Entry:** `src/extension.ts`
- **Build:** `esbuild` bundles to `out/extension.js`
- **Dependency on core:** `"@contextd/core": "workspace:*"`
- **Published to:** VS Code Marketplace + `.vsix` attached to GitHub Release
- **Note:** `context.ts` is removed; all context logic moves to `@contextd/core`

---

## Build Pipeline (Turbo)

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["out/**", "dist/**"]
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

**Build order enforced by Turbo:** `core` → `cli` + `vscode` (parallel)

**Root scripts:**
```json
{
  "build": "turbo build",
  "dev": "turbo dev",
  "lint": "turbo lint",
  "type-check": "turbo type-check"
}
```

---

## CI/CD

### `ci.yml` — Every push and PR

```
triggers: push to main, pull_request

steps:
  1. pnpm install (with cache)
  2. turbo build
  3. turbo type-check
  4. turbo lint
```

Keeps the feedback loop fast. Turbo caches outputs so unchanged packages are skipped.

### `release.yml` — Changesets release automation

```
trigger: push to main

steps:
  1. pnpm install
  2. turbo build
  3. changesets/action
     - if unmerged changesets exist → opens/updates "Version Packages" PR
     - if "Version Packages" PR is merged → publishes packages + creates GitHub Releases
```

### Release Flow (Developer Workflow)

```
1. Make code change
2. pnpm changeset          ← select package, bump type, write summary
3. Open PR                 ← CI runs
4. Merge PR                ← Changesets bot opens "Version Packages" PR
5. Review + merge that PR  ← triggers publish + GitHub Release creation
```

### GitHub Releases Produced

| Git tag | Release title | Assets |
|---|---|---|
| `cli@x.y.z` | contextd CLI vx.y.z | npm install instructions in notes |
| `vscode@x.y.z` | contextd VS Code vx.y.z | `contextd-x.y.z.vsix` attached |
| `core@x.y.z` | @contextd/core vx.y.z | npm install instructions in notes |

Each package is versioned and released independently. A change to the extension does not force a CLI release.

---

## Migration Steps (High Level)

1. Initialize git repo at `contextd-projects/`
2. Set up root `package.json`, `pnpm-workspace.yaml`, `turbo.json`
3. Move `contextd/` → `packages/cli/`, `contextd-vscode/` → `packages/vscode/`
4. Create `packages/core/` with merged context logic (TypeScript)
5. Update `cli` to import from `@contextd/core` instead of `./core/context.js`
6. Remove `vscode/src/context.ts`, update imports to `@contextd/core`
7. Configure Changesets in independent mode
8. Wire up `.github/workflows/ci.yml` and `release.yml`
9. Initial changeset + version bump to `0.1.0` across all three packages
10. Push to GitHub

---

## Out of Scope

- VS Code Marketplace automated publishing (requires `VSCE_PAT` secret; can be added later)
- Standalone binary distribution for the CLI
- Turborepo remote cache (can be enabled via Vercel for free, but not required day one)
- Testing infrastructure (no existing tests to migrate)
