# contextd Docs Site — Design Spec

**Date:** 2026-05-03  
**Status:** Approved

---

## Overview

A minimal documentation site for contextd, deployed at `contextd.danfarr.com`. Built with Nextra inside the existing pnpm + Turborepo monorepo as `packages/docs`. Style: clean, ChatGPT/OpenAI-inspired — no heavy branding, no hero sections.

---

## Architecture

- **Framework:** [Nextra](https://nextra.site) with `nextra-theme-docs`
- **Location:** `packages/docs` in the monorepo
- **Build:** Added to `turbo.json` pipeline so `pnpm build` includes it
- **Deployment:** Separate Vercel project, custom domain `contextd.danfarr.com`
- **Dependencies:** No changes to `cli`, `core`, or `vscode` packages

---

## Content Structure

```
packages/docs/
  pages/
    index.mdx                 ← overview + "Get started" link
    getting-started.mdx       ← install (npm/npx), contextd init, quickstart
    cli/
      _meta.json              ← sidebar ordering
      export.mdx              ← contextd export, --format, --files flags
      check.mdx               ← contextd check
      decision.mdx            ← contextd decision add/list
      serve.mdx               ← contextd serve
    mcp-server.mdx            ← MCP config JSON, available tools
    vscode-extension.mdx      ← install, features list
    context-files.mdx         ← .context/ folder format + file descriptions
    export-formats.mdx        ← CLAUDE.md, .cursorrules, raw stdout
  theme.config.tsx            ← Nextra theme config (logo, nav, footer)
  next.config.js              ← Nextra plugin setup
  package.json
```

---

## Visual Design

- **Font:** Inter, system-ui fallback
- **Colors:** Nextra default palette; accent `#0ea5e9` (sky blue)
- **Dark mode:** Toggle in top-right header; defaults to system preference
- **Logo:** Text-only `contextd` — no custom icon
- **Landing page (`index.mdx`):** Short tagline + one-liner description + "Get started →" link. No hero image or illustration.
- **Sidebar:** Auto-generated from file structure via `_meta.json` ordering

---

## Deployment

1. Create a new Vercel project pointing at `packages/docs` (root directory override)
2. Add `contextd.danfarr.com` as a custom domain in Vercel
3. Add a CNAME record: `contextd` → `cname.vercel-dns.com` in DNS
4. Vercel auto-provisions SSL

---

## Out of Scope

- Search (Nextra includes basic CMD+K search via pagefind — no extra config needed)
- Authentication
- Versioned docs
- Custom illustrations or icons
