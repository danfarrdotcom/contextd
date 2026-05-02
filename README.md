# contextd

> The context layer for AI-assisted development.

Stop copy-pasting context into every AI conversation. Define your project's knowledge once, share it with your whole team via git, and pipe it into any AI tool automatically.

```bash
npm install -g contextd
contextd init
contextd export          # → CLAUDE.md
contextd serve           # → MCP server
```

---

## The problem

Every developer using AI tools is solving the same problem differently:

- How do I give the AI the *right* context without blowing the context window?
- How do I make it remember the decisions we made last month?
- Why does it keep suggesting patterns we explicitly decided against?
- How do I share our AI setup with my whole team?

**contextd is the missing layer between your codebase and any AI tool.**

---

## How it works

```
your-repo/
  .context/
    project.md        ← what this is, tech stack, goals
    architecture.md   ← how the system is designed
    conventions.md    ← coding standards, patterns
    decisions/        ← why you made key choices (ADRs)
      001-use-postgres.md
      002-no-redux.md
    modules/          ← per-folder context
      api.md
      payments.md
```

Check `.context/` into git. Everyone on your team gets the same AI behavior. New devs onboard instantly.

---

## Packages

| Package | Description | Install |
|---|---|---|
| [`contextd`](packages/cli) | CLI tool | `npm i -g contextd` |
| [`contextd-vscode`](packages/vscode) | VS Code extension | [Marketplace](#) |
| [`@contextd/core`](packages/core) | Shared library | `npm i @contextd/core` |

---

## CLI

```bash
# Initialize
contextd init                              # scaffold .context/
contextd init --minimal                    # project.md only

# Export to AI tools
contextd export                            # → CLAUDE.md
contextd export --format cursorrules       # → .cursorrules
contextd export --format raw               # → stdout
contextd export --files src/api/users.ts   # context for specific files only

# Health check
contextd check                             # find gaps, stale files, empty templates

# Architecture decisions
contextd decision add "Why we use tRPC"
contextd decision list

# MCP server (Claude, Cursor, etc.)
contextd serve
```

### MCP server

```json
{
  "mcpServers": {
    "contextd": {
      "command": "npx",
      "args": ["contextd", "serve"]
    }
  }
}
```

Available tools: `get_project_overview`, `get_conventions`, `get_relevant_context`, `list_decisions`, `get_module_context`

---

## VS Code extension

Install from the Marketplace, open the command palette, and run **contextd: Initialize in this project**.

Features:
- **Context sidebar** — browse all `.context/` files
- **Health dashboard** — live coverage score
- **One-click export** — CLAUDE.md, .cursorrules, or clipboard
- **Copy context for current file** — right-click any file
- **Add decisions** — ADR templates in one step
- **Auto-export on save** — regenerates on every context change

---

## Why not just edit CLAUDE.md directly?

| | Manual CLAUDE.md | contextd |
|---|---|---|
| Team sharing | Copy-paste | Git-native |
| Organization | Gets huge fast | Modular files |
| Tool switching | Rewrite everything | `export --format` |
| Staleness detection | Never | `contextd check` |
| Relevant-only context | All or nothing | `--files` flag |
| Decision tracking | Separate doc | Built-in ADRs |
| MCP integration | Manual | `contextd serve` |

---

## Development

This is a pnpm + Turborepo monorepo.

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Type-check
pnpm type-check

# Develop CLI
pnpm --filter contextd dev

# Develop VS Code extension
pnpm --filter contextd-vscode watch
```

### Releases

Releases are automated via [Changesets](https://github.com/changesets/changesets). Open a PR with conventional commits — a changeset is generated automatically:

| Commit prefix | Release |
|---|---|
| `feat:` | minor |
| `fix:` `perf:` `refactor:` | patch |
| `feat!:` or `BREAKING CHANGE` | major |
| `chore:` `docs:` `test:` | no release |

Merge the PR → Changesets opens a **Version Packages** PR → merge it to publish.

---

## License

MIT
