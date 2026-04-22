# contextd for VS Code

> The context layer for AI-assisted development — right inside your editor.

Manage your project's AI context without leaving VS Code. Edit `.context/` files, export to CLAUDE.md or `.cursorrules`, track architecture decisions, and monitor coverage — all from the sidebar.

---

## Features

### 📁 Context Sidebar
A dedicated activity bar panel showing all your context files organized by type — core docs, architecture decisions, and module context. Click any file to open it instantly.

### 💚 Health Dashboard
Live health score for your context coverage. See at a glance which files are missing, stale, or unfilled — without running any commands.

### ⚡ One-Click Export
Export your context to any AI tool format directly from the sidebar or command palette:
- **CLAUDE.md** — for Claude Code
- **.cursorrules** — for Cursor
- **Clipboard** — paste anywhere

### 📋 Copy Context for Current File
Right-click any file → **contextd: Copy relevant context to clipboard**. Gets only the context relevant to what you're working on — not everything.

### 📝 Add Architecture Decisions
Record ADRs (Architecture Decision Records) without leaving your editor. `Cmd+Shift+P` → **contextd: Add architecture decision** — type a title, get a pre-filled template.

### 🗂 Add Module Context
Working in a new directory? Right-click → **contextd: Add module context for current file** — creates a scoped context file pre-filled with the right path.

### 🔄 Auto-Export on Save
Enable `contextd.autoExportOnSave` to automatically regenerate your CLAUDE.md whenever you update any context file.

---

## Getting Started

1. Install the extension
2. Open your project in VS Code
3. Open the command palette (`Cmd+Shift+P`) → **contextd: Initialize in this project**
4. Fill in `.context/project.md` with your project details
5. Click **Export** in the contextd sidebar to generate your `CLAUDE.md`
6. Commit `.context/` to share with your team

---

## Commands

| Command | Description |
|---|---|
| `contextd: Initialize` | Scaffold `.context/` directory |
| `contextd: Export context` | Export to CLAUDE.md, .cursorrules, or clipboard |
| `contextd: Check context health` | Open the health dashboard |
| `contextd: Add architecture decision` | Create a new ADR |
| `contextd: Add module context for current file` | Add scoped module context |
| `contextd: Copy relevant context to clipboard` | Copy context for the active file |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `contextd.autoExportOnSave` | `false` | Auto-regenerate export when context files change |
| `contextd.defaultExportFormat` | `claude-md` | Default export format |
| `contextd.showStatusBar` | `true` | Show contextd in the status bar |

---

## How It Works

contextd reads from a `.context/` directory in your project root:

```
your-repo/
  .context/
    project.md        ← what this is, tech stack, goals
    architecture.md   ← system design
    conventions.md    ← coding standards
    decisions/        ← architecture decisions (ADRs)
      001-use-postgres.md
    modules/          ← per-directory context
      api.md
```

This directory is committed to git — your whole team shares the same AI context.

---

## CLI Companion

For terminal users, the `contextd` CLI offers the same features plus MCP server mode:

```bash
npx contextd init
npx contextd serve   # MCP server for Claude/Cursor
```

---

## License

MIT
