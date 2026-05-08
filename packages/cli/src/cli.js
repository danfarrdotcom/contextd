#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { exportCommand } from './commands/export.js';
import { checkCommand } from './commands/check.js';
import { decisionCommand } from './commands/decision.js';
import { serveCommand } from './commands/serve.js';
import { authCommand } from './commands/auth.js';
import { syncCommand } from './commands/sync.js';

console.error(chalk.cyan.bold('\n  contextd') + chalk.gray(' — the context layer for AI development\n'));

program
  .name('contextd')
  .description('Manage AI context for your codebase')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize contextd in the current project')
  .option('--minimal', 'Create minimal config only')
  .action(initCommand);

program
  .command('export')
  .description('Export context to a specific AI tool format')
  .option('--format <format>', 'Output format: claude-md, cursorrules, mcp, raw', 'claude-md')
  .option('--output <path>', 'Output file path (defaults to format standard)')
  .option('--files <files>', 'Comma-separated list of files to get context for')
  .action(exportCommand);

program
  .command('check')
  .description('Check the health of your context files')
  .option('--fix', 'Auto-fix simple issues')
  .action(checkCommand);

program
  .command('decision')
  .description('Manage architecture decision records (ADRs)')
  .argument('<action>', 'Action: add, list, view')
  .argument('[title]', 'Decision title (for add) or number (for view)')
  .action(decisionCommand);

program
  .command('serve')
  .description('Start contextd as an MCP server (stdio)')
  .action(serveCommand);

program
  .command('auth')
  .description('Authenticate with contextd remote')
  .argument('<action>', 'Action: login, logout, status')
  .action(authCommand);

program
  .command('sync')
  .description('Manage remote context sources')
  .argument('<action>', 'Action: add, remove, list, now, publish')
  .argument('[args...]', 'Additional arguments')
  .option('--type <type>', 'Filter by context type (for sync add)')
  .option('--tags <tags>', 'Comma-separated tag filter (for sync add)')
  .option('--target <target>', 'Target org/collection (for sync publish)')
  .option('--dry-run', 'Preview without pushing (for sync publish)')
  .action(syncCommand);

program.parse();
