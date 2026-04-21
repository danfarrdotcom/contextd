import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findRoot, loadAllContext, getRelevantContext, buildExportOutput } from '@contextd/core';

const FORMATS = {
  'claude-md': { file: 'CLAUDE.md', label: 'CLAUDE.md (Claude Code)' },
  'cursorrules': { file: '.cursorrules', label: '.cursorrules (Cursor)' },
  'raw': { file: null, label: 'Raw output' },
  'mcp': { file: null, label: 'MCP (served live via contextd serve)' },
};

export async function exportCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  const format = options.format;
  if (!FORMATS[format]) {
    console.log(chalk.red(`\n  ✗ Unknown format: ${format}`));
    console.log(chalk.gray(`  Available: ${Object.keys(FORMATS).join(', ')}\n`));
    process.exit(1);
  }

  if (format === 'mcp') {
    console.log(chalk.yellow('\n  For MCP, run: contextd serve\n'));
    return;
  }

  const spinner = ora(`Exporting as ${FORMATS[format].label}...`).start();

  try {
    let contexts;
    if (options.files) {
      const filePaths = options.files.split(',').map(f => f.trim());
      contexts = await getRelevantContext(rootDir, filePaths);
    } else {
      const ctx = await loadAllContext(rootDir);
      contexts = ctx.all;
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
    console.log(chalk.gray(`\n  ${lines} lines · ${chars} chars · ${contexts.length} context files merged\n`));

  } catch (err) {
    spinner.fail('Export failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}
