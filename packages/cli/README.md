# contextd

> The context layer for AI-assisted development.

Stop copy-pasting context into every AI conversation. Define your project's knowledge once, share it with your whole team via git, and pipe it into any AI tool automatically.

```bash
npx contextd init
npx contextd export                      # → CLAUDE.md
npx contextd export --format cursorrules # → .cursorrules
npx contextd serve                       # → MCP server for Claude/Cursor
npx contextd auth login                  # → join or create a remote org
npx contextd sync add contextd://org/collection  # → subscribe to shared context
```

---

## The Problem

Every developer using AI tools is solving the same problem differently:

- How do I give the AI the *right* context without blowing the context window?
- How do I make it remember the decisions we made last month?
- Why does it keep suggesting patterns we explicitly decided against?
- How do I share our AI setup with my whole team?

Right now people are hacking together giant `CLAUDE.md` files that become unmaintainable, copy-pasting context manually, or just hoping the AI figures it out.

**contextd is the missing layer between your codebase and any AI tool.**

---

## How It Works

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
      ui.md
```

This directory is **checked into git**. Everyone on your team gets the same AI behavior. New devs onboard instantly.

---

## Installation

```bash
# Use directly via npx
npx contextd init

# Or install globally
npm install -g contextd
contextd init
```

---

## Commands

### `contextd init`
Scaffold the `.context/` directory with templates.

```bash
contextd init           # full setup
contextd init --minimal # project.md only
```

### `contextd export`
Export your context to your AI tool of choice.

```bash
contextd export                          # → CLAUDE.md (default)
contextd export --format cursorrules     # → .cursorrules
contextd export --format raw             # → stdout

# Export only context relevant to specific files
contextd export --files src/api/users.ts,src/api/auth.ts
```

### `contextd check`
Health check your context files — find gaps, stale files, and empty templates.

```bash
contextd check
```

```
  ✓ project.md exists
  ✓ 3 architecture decisions recorded
  ⚠  conventions.md appears to be empty/unfilled
  ⚠  src/payments/ has no module context
```

### `contextd decision`
Manage architecture decision records (ADRs).

```bash
contextd decision add "Why we use tRPC instead of REST"
contextd decision list
```

### `contextd serve`
Run contextd as an MCP server — AI tools query your context dynamically instead of getting it all dumped upfront.

```bash
contextd serve
```

Add to your `.mcp.json`:

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

Available MCP tools:
- `get_project_overview` — high-level project + architecture
- `get_conventions` — coding standards
- `get_relevant_context({ files })` — smart context for specific files
- `list_decisions` — all ADRs
- `get_module_context({ module })` — context for a specific area

All tools automatically include remote contexts if you have any sources configured.

---

### `contextd auth`
Authenticate with the contextd remote service.

```bash
contextd auth login    # create a new org or add a key to an existing one
contextd auth logout   # remove saved credentials
```

Credentials are saved to `~/.contextd/config.json`.

---

### `contextd sync`
Subscribe to shared context collections and publish your own.

```bash
# Subscribe
contextd sync add contextd://org/collection
contextd sync add contextd://org/collection --type conventions --tags backend
contextd sync list
contextd sync now                              # force refresh all sources
contextd sync remove org/collection

# Publish your local .context/ to a remote collection
contextd sync publish
contextd sync publish --target org/collection
contextd sync publish --dry-run               # preview without pushing
```

Remote contexts are cached to `.context/remote/` (gitignored) and auto-refreshed when you run `export` or `serve` if the cache is older than 24 hours. **Local contexts always win** on slug conflicts.

---

## Module Context

Add per-directory context by creating files in `.context/modules/`:

```markdown
---
title: API Module
scope: src/api
updated: 2025-01-01
---

# API Module

This module handles all HTTP endpoints using Hono.
We use Zod for input validation on every route.
Auth is handled via middleware — never inline in routes.
```

contextd will automatically include this when you're working on files in `src/api/`.

---

## Why Not Just Edit CLAUDE.md Directly?

You can — but contextd gives you:

| | Manual CLAUDE.md | contextd |
|---|---|---|
| Team sharing | Copy-paste | Git-native |
| Stays organized | Gets huge fast | Modular files |
| Tool switching | Rewrite everything | `export --format` |
| Staleness detection | Never | `contextd check` |
| Relevant-only context | All or nothing | `--files` flag |
| Decision tracking | Separate doc | Built-in ADRs |
| MCP integration | Manual | `contextd serve` |
| Remote sharing | Not possible | `contextd sync` |

---

## Roadmap

- [x] Remote sync — share context collections across repos and teams
- [ ] Embeddings-based smart context selection
- [ ] VS Code extension
- [ ] GitHub Action for context drift detection
- [ ] Context analytics (what's actually being read?)

---

## Contributing

PRs welcome. This is early-stage — the most valuable contributions right now are:
- Bug reports and edge cases
- New export format support
- Ideas for the smart context selection algorithm

---

## License

MIT
