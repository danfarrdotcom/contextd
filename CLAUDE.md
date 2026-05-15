# contextd

The context layer for AI-assisted development. A pnpm + Turborepo monorepo.

## Packages

- `packages/core` — shared TypeScript library (`@danfarrdotcom/core`). Builds to ESM + CJS.
- `packages/cli` — the `contextd` CLI. Runs from source (no build step). Depends on core via `workspace:*`.
- `packages/vscode` — VS Code extension. Compiles with `tsc`.
- `packages/worker` — Cloudflare Worker (Hono + D1 + KV) for remote sync API.
- `packages/docs` — Nextra documentation site.

## Development

```bash
pnpm install
pnpm build          # builds core (required before CLI works)
pnpm type-check     # all packages
pnpm test           # runs turbo test across packages
```

When changing core, rebuild before testing CLI: `pnpm --filter @danfarrdotcom/core build`

## Architecture decisions

- CLI is plain JS (no build step) for fast iteration. Core is TypeScript with dual ESM/CJS output.
- Remote sync uses Cloudflare D1 for metadata and KV for context body storage.
- MCP server runs over stdio only (no HTTP transport yet).
- Context staleness detection uses git history to compare when context files were last updated vs when the code they cover was last changed.

## Conventions

- Use `console.error` for CLI output (stdout is reserved for data output like `export --format raw`).
- All CLI commands follow the pattern: find root, validate, execute, print results.
- Core functions are sync where possible, async only when doing I/O.
- Staleness detection gracefully degrades — if git isn't available, it silently skips.
