import chalk from 'chalk';
import { findRoot, loadAllContext, getRelevantContext, loadRemoteContexts, mergeContexts, loadSourcesConfig, shouldAutoRefresh } from '@danfarrdotcom/core';
import { syncNow } from './sync.js';

export async function serveCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.error(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  // Auto-refresh stale remote sources (non-blocking)
  const config = await loadSourcesConfig(rootDir);
  const stale = config.sources.filter(shouldAutoRefresh);
  if (stale.length) syncNow(rootDir, { silent: true }).catch(() => {});

  // Warn on very stale sources (>7 days)
  const veryStale = config.sources.filter(s => {
    if (!s.last_synced) return false;
    const age = Date.now() - new Date(s.last_synced).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  });
  if (veryStale.length) {
    veryStale.forEach(s => console.error(chalk.yellow(`  ⚠ Remote context ${s.name} hasn't synced in over 7 days`)));
  }

  // Dynamically import MCP SDK
  let McpServer, StdioServerTransport;
  try {
    const sdkModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
    McpServer = sdkModule.McpServer;
    const transportModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
    StdioServerTransport = transportModule.StdioServerTransport;
  } catch (e) {
    console.error(chalk.red('\n  ✗ MCP SDK not available. Run: npm install @modelcontextprotocol/sdk\n'));
    process.exit(1);
  }

  const { z } = await import('zod');

  const server = new McpServer({
    name: 'contextd',
    version: '0.1.0',
  });

  // Tool: get_project_overview
  server.tool('get_project_overview', 'Get a high-level overview of the project', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const parts = [];

    const project = merged.find(c => c === ctx.project) || ctx.project;
    const architecture = merged.find(c => c === ctx.architecture) || ctx.architecture;

    if (project) parts.push(project.content);
    if (architecture) parts.push(`## Architecture\n\n${architecture.content}`);

    return {
      content: [{
        type: 'text',
        text: parts.join('\n\n---\n\n') || 'No project context found.',
      }],
    };
  });

  // Tool: get_conventions
  server.tool('get_conventions', 'Get coding conventions and standards for this project', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const conventions = merged.find(c => c === ctx.conventions) || ctx.conventions;
    return {
      content: [{
        type: 'text',
        text: conventions?.content || 'No conventions defined yet.',
      }],
    };
  });

  // Tool: get_relevant_context
  server.tool(
    'get_relevant_context',
    'Get context relevant to specific files or areas of the codebase',
    { files: z.array(z.string()).describe('List of file paths you are working with') },
    async ({ files }) => {
      const local = await getRelevantContext(rootDir, files);
      const remote = await loadRemoteContexts(rootDir);
      const merged = await mergeContexts(local, remote);
      const text = merged.map(c => c.content).join('\n\n---\n\n');
      return {
        content: [{
          type: 'text',
          text: text || 'No relevant context found for those files.',
        }],
      };
    }
  );

  // Tool: list_decisions
  server.tool('list_decisions', 'List all architecture decisions (ADRs)', {}, async () => {
    const ctx = await loadAllContext(rootDir);
    const remote = await loadRemoteContexts(rootDir);
    const merged = await mergeContexts(ctx.all, remote);
    const decisions = merged.filter(c => c.path.includes('/decisions/'));
    if (decisions.length === 0) {
      return { content: [{ type: 'text', text: 'No architecture decisions recorded.' }] };
    }
    const text = decisions.map(d =>
      `## ${d.meta?.title ?? d.title ?? 'Decision'}\n${d.content}`
    ).join('\n\n---\n\n');
    return { content: [{ type: 'text', text }] };
  });

  // Tool: get_module_context
  server.tool(
    'get_module_context',
    'Get context for a specific module or directory',
    { module: z.string().describe('Module name or path (e.g. "api", "ui", "payments")') },
    async ({ module: moduleName }) => {
      const ctx = await loadAllContext(rootDir);
      const remote = await loadRemoteContexts(rootDir);
      const merged = await mergeContexts(ctx.all, remote);
      const mod = merged.find(m =>
        m.meta?.scope?.includes(moduleName) ||
        m.path?.includes(moduleName)
      );
      return {
        content: [{
          type: 'text',
          text: mod?.content || `No context found for module: ${moduleName}`,
        }],
      };
    }
  );

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(chalk.cyan('\n  contextd MCP server running (stdio)\n'));
  console.error(chalk.gray('  Add to your .mcp.json:\n'));
  console.error(chalk.gray(`  {
    "mcpServers": {
      "contextd": {
        "command": "npx",
        "args": ["contextd", "serve"]
      }
    }
  }\n`));
}
