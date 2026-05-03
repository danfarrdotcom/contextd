import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findRoot, loadAllContext, getRelevantContext, buildExportOutput, loadRemoteContexts, mergeContexts, loadSourcesConfig, shouldAutoRefresh } from '@danfarrdotcom/core';
import { syncNow } from './sync.js';

const FORMATS = {
  'claude-md': { file: 'CLAUDE.md', label: 'CLAUDE.md (Claude Code)' },
  'cursorrules': { file: '.cursorrules', label: '.cursorrules (Cursor)' },
  'raw': { file: null, label: 'Raw output' },
  'mcp': { file: null, label: 'MCP (served live via contextd serve)' },
};

export async function exportCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.error(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  const format = options.format;
  if (!FORMATS[format]) {
    console.error(chalk.red(`\n  ✗ Unknown format: ${format}`));
    console.error(chalk.gray(`  Available: ${Object.keys(FORMATS).join(', ')}\n`));
    process.exit(1);
  }

  if (format === 'mcp') {
    console.error(chalk.yellow('\n  For MCP, run: contextd serve\n'));
    return;
  }

  const spinner = ora(`Exporting as ${FORMATS[format].label}...`).start();

  try {
    // Auto-refresh stale remote sources in background
    const config = await loadSourcesConfig(rootDir);
    const stale = config.sources.filter(shouldAutoRefresh);
    if (stale.length) await syncNow(rootDir, { silent: true }).catch(() => {});

    // Warn if any source hasn't synced in >7 days
    const veryStale = config.sources.filter(s => {
      if (!s.last_synced) return false;
      const age = Date.now() - new Date(s.last_synced).getTime();
      return age > 7 * 24 * 60 * 60 * 1000;
    });
    if (veryStale.length) {
      veryStale.forEach(s => console.error(chalk.yellow(`  ⚠ Remote context ${s.name} hasn't synced in over 7 days`)));
    }

    const remoteContexts = await loadRemoteContexts(rootDir);

    let contexts;
    if (options.files) {
      const filePaths = options.files.split(',').map(f => f.trim());
      contexts = await getRelevantContext(rootDir, filePaths);
      contexts = await mergeContexts(contexts, remoteContexts);
    } else {
      const ctx = await loadAllContext(rootDir);
      contexts = await mergeContexts(ctx.all, remoteContexts);
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
    console.error(chalk.gray(`\n  ${lines} lines · ${chars} chars · ${contexts.length} context files merged\n`));

  } catch (err) {
    spinner.fail('Export failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}
