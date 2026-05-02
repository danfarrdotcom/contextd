import chalk from 'chalk';
import { findRoot, loadAllContext, getRelevantContext } from '@danfarrdotcom/core';

export async function serveCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  // Dynamically import MCP SDK
  let McpServer, StdioServerTransport;
  try {
    const sdkModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
    McpServer = sdkModule.McpServer;
    const transportModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
    StdioServerTransport = transportModule.StdioServerTransport;
  } catch (e) {
    console.log(chalk.red('\n  ✗ MCP SDK not available. Run: npm install @modelcontextprotocol/sdk\n'));
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
    const parts = [];

    if (ctx.project) parts.push(ctx.project.content);
    if (ctx.architecture) parts.push(`## Architecture\n\n${ctx.architecture.content}`);

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
    return {
      content: [{
        type: 'text',
        text: ctx.conventions?.content || 'No conventions defined yet.',
      }],
    };
  });

  // Tool: get_relevant_context
  server.tool(
    'get_relevant_context',
    'Get context relevant to specific files or areas of the codebase',
    { files: z.array(z.string()).describe('List of file paths you are working with') },
    async ({ files }) => {
      const contexts = await getRelevantContext(rootDir, files);
      const text = contexts.map(c => c.content).join('\n\n---\n\n');
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
    if (ctx.decisions.length === 0) {
      return { content: [{ type: 'text', text: 'No architecture decisions recorded.' }] };
    }
    const text = ctx.decisions.map(d =>
      `## ${d.meta.title}\n${d.content}`
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
      const mod = ctx.modules.find(m =>
        m.meta.scope?.includes(moduleName) ||
        m.path.includes(moduleName)
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
