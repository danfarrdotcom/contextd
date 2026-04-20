import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { findRoot, getContextStats, loadAllContext } from '@contextd/core';

export async function checkCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  console.log(chalk.bold('\n  Context Health Check\n'));

  const stats = await getContextStats(rootDir);
  const ctx = await loadAllContext(rootDir);
  const issues = [];
  const warnings = [];
  const passes = [];

  // Check core files exist
  if (stats.hasProject) {
    passes.push('project.md exists');
  } else {
    issues.push('Missing project.md — run contextd init');
  }

  if (stats.hasArchitecture) {
    passes.push('architecture.md exists');
  } else {
    warnings.push('No architecture.md — recommended for larger projects');
  }

  if (stats.hasConventions) {
    passes.push('conventions.md exists');
  } else {
    warnings.push('No conventions.md — helps AI follow your coding style');
  }

  // Check for empty/stub files
  for (const c of ctx.all) {
    const isEmpty = !c.content || c.content.length < 50;
    const hasOnlyComments = c.content && c.content.split('\n').every(l =>
      l.trim().startsWith('<!--') || l.trim().startsWith('#') || l.trim() === ''
    );

    if (isEmpty || hasOnlyComments) {
      warnings.push(`${path.relative(rootDir, c.path)} appears to be empty/unfilled`);
    }
  }

  // Check for stale files (> 3 months old)
  for (const stalePath of stats.stale) {
    const rel = path.relative(rootDir, stalePath);
    if (!rel.includes('.gitkeep')) {
      warnings.push(`${rel} has no updated date or is > 3 months old`);
    }
  }

  // Check decisions
  if (stats.decisions === 0) {
    warnings.push('No architecture decisions recorded — consider adding ADRs');
  } else {
    passes.push(`${stats.decisions} architecture decision(s) recorded`);
  }

  // Check for source directories without module context
  const srcDirs = await getSourceDirs(rootDir);
  const coveredModules = ctx.modules.map(m => m.meta.scope).filter(Boolean);

  for (const dir of srcDirs) {
    const covered = coveredModules.some(scope => dir.includes(scope));
    if (!covered) {
      warnings.push(`${dir}/ has no module context — consider adding .context/modules/${path.basename(dir)}.md`);
    }
  }

  // Print results
  for (const p of passes) {
    console.log(`  ${chalk.green('✓')} ${chalk.gray(p)}`);
  }

  for (const w of warnings) {
    console.log(`  ${chalk.yellow('⚠')}  ${w}`);
  }

  for (const issue of issues) {
    console.log(`  ${chalk.red('✗')} ${issue}`);
  }

  // Summary
  console.log('');
  if (issues.length === 0 && warnings.length === 0) {
    console.log(chalk.green.bold('  ✓ Context looks great!\n'));
  } else {
    console.log(chalk.bold(`  ${passes.length} passed · ${chalk.yellow(warnings.length + ' warnings')} · ${chalk.red(issues.length + ' errors')}\n`));
  }

  if (issues.length > 0) process.exit(1);
}

async function getSourceDirs(rootDir) {
  const candidates = ['src', 'app', 'lib', 'packages', 'services', 'api', 'components'];
  const found = [];

  for (const dir of candidates) {
    const fullPath = path.join(rootDir, dir);
    if (await fs.pathExists(fullPath)) {
      // Get immediate subdirectories
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const subdirs = entries.filter(e => e.isDirectory()).map(e => `${dir}/${e.name}`);
      if (subdirs.length > 0) {
        found.push(...subdirs.slice(0, 5)); // limit to 5
      } else {
        found.push(dir);
      }
    }
  }

  return found.slice(0, 8); // max 8 dirs to check
}
