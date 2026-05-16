import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { findRoot, getContextStats, loadAllContext, getStalenessReport } from '@danfarrdotcom/core';

export async function checkCommand(options) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.error(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  console.error(chalk.bold('\n  Context Health Check\n'));

  const stats = await getContextStats(rootDir);
  const ctx = await loadAllContext(rootDir);
  const issues = [];
  const warnings = [];
  const passes = [];
  const fixed = [];

  // Check core files exist
  if (stats.hasProject) {
    passes.push('project.md exists');
  } else {
    if (options.fix) {
      // Auto-create missing project.md
      const projectPath = path.join(rootDir, '.context', 'project.md');
      await fs.writeFile(projectPath, `# Project\n\n<!-- Describe your project here -->\n\n## Overview\nWhat does this project do?\n\n## Tech Stack\n- Framework:\n- Language:\n- Database:\n`);
      fixed.push('Created project.md');
      passes.push('project.md exists');
    } else {
      issues.push('Missing project.md — run contextd init');
    }
  }

  if (stats.hasArchitecture) {
    passes.push('architecture.md exists');
  } else {
    if (options.fix) {
      const archPath = path.join(rootDir, '.context', 'architecture.md');
      await fs.writeFile(archPath, `# Architecture\n\n<!-- Describe your architecture -->\n\n## System Overview\nHigh-level architecture diagram and descriptions.\n\n## Key Components\n- Component A:\n- Component B:\n`);
      fixed.push('Created architecture.md');
      passes.push('architecture.md exists');
    } else {
      warnings.push('No architecture.md — recommended for larger projects');
    }
  }

  if (stats.hasConventions) {
    passes.push('conventions.md exists');
  } else {
    if (options.fix) {
      const convPath = path.join(rootDir, '.context', 'conventions.md');
      await fs.writeFile(convPath, `# Conventions\n\n<!-- Define your coding conventions -->\n\n## Code Style\n- Naming conventions:\n- File organization:\n\n## Patterns\n- Preferred patterns:\n- Anti-patterns to avoid:\n`);
      fixed.push('Created conventions.md');
      passes.push('conventions.md exists');
    } else {
      warnings.push('No conventions.md — helps AI follow your coding style');
    }
  }

  // Check for empty/stub files
  for (const c of ctx.all) {
    const isEmpty = !c.content || c.content.length < 50;
    const hasOnlyComments = c.content && c.content.split('\n').every(l =>
      l.trim().startsWith('<!--') || l.trim().startsWith('#') || l.trim() === ''
    );

    if (isEmpty || hasOnlyComments) {
      if (options.fix && hasOnlyComments) {
        // Add placeholder content to comment-only files
        const placeholder = `\n<!-- TODO: Fill in content for ${path.basename(c.path)} -->\n\n## Overview\nAdd details here.\n`;
        await fs.appendFile(c.path, placeholder);
        fixed.push(`Added placeholder to ${path.relative(rootDir, c.path)}`);
      } else {
        warnings.push(`${path.relative(rootDir, c.path)} appears to be empty/unfilled`);
      }
    }
  }

  // Check for stale files (> 3 months old)
  for (const stalePath of stats.stale) {
    const rel = path.relative(rootDir, stalePath);
    if (!rel.includes('.gitkeep')) {
      if (options.fix) {
        // Update the updated-date comment
        const today = new Date().toISOString().split('T')[0];
        let content = await fs.readFile(stalePath, 'utf-8');
        content = content.replace(/<!--\s*updated-date:\s*[\d-]+\s*-->/, `<!-- updated-date: ${today} -->`);
        if (!content.includes('updated-date')) {
          content = `<!-- updated-date: ${today} -->\n\n` + content;
        }
        await fs.writeFile(stalePath, content);
        fixed.push(`Updated date in ${rel}`);
      } else {
        warnings.push(`${rel} has no updated date or is > 3 months old`);
      }
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
      if (options.fix) {
        const moduleName = path.basename(dir);
        const modulePath = path.join(rootDir, '.context', 'modules', `${moduleName}.md`);
        await fs.writeFile(modulePath, `# ${moduleName}\n\n<!-- Module context for ${dir} -->\n\n## Purpose\nWhat does this module do?\n\n## Key Files\n- \`filename\`: Description\n\n## Dependencies\n- External services:\n- Internal modules:\n`);
        fixed.push(`Created module context for ${dir}`);
      } else {
        warnings.push(`${dir}/ has no module context — consider adding .context/modules/${moduleName}.md`);
      }
    }
  }

  // Check context staleness vs code changes (git-based)
  try {
    const report = getStalenessReport(rootDir, ctx.all);
    if (report.staleCount > 0 || report.warningCount > 0) {
      console.error(chalk.bold('\n  Code Staleness Detection\n'));
      for (const item of report.items) {
        const rel = path.relative(rootDir, item.contextPath);
        if (item.severity === 'stale') {
          const coversStr = item.covers.join(', ');
          warnings.push(`${rel} is stale — code in ${coversStr} changed ${item.staleDays}d ago (${item.changedFiles} file changes)`);
        } else if (item.severity === 'warning') {
          const coversStr = item.covers.join(', ');
          warnings.push(`${rel} may be outdated — code in ${coversStr} changed ${item.staleDays}d ago`);
        }
      }
      if (report.freshCount > 0) {
        passes.push(`${report.freshCount} context file(s) are up-to-date with code`);
      }
    } else if (report.items.some(i => i.covers.length > 0)) {
      passes.push('All context files are up-to-date with code changes');
    }
  } catch {
    // Git not available or not a git repo — skip staleness check
  }

  // Print results
  for (const f of fixed) {
    console.error(`  ${chalk.green('✓')} ${chalk.gray(f)}`);
  }

  for (const p of passes) {
    console.error(`  ${chalk.green('✓')} ${chalk.gray(p)}`);
  }

  for (const w of warnings) {
    console.error(`  ${chalk.yellow('⚠')}  ${w}`);
  }

  for (const issue of issues) {
    console.error(`  ${chalk.red('✗')} ${issue}`);
  }

  // Summary
  console.error('');
  if (fixed.length > 0) {
    console.error(chalk.green.bold(`  ✓ Fixed ${fixed.length} issue(s)\n`));
  } else if (issues.length === 0 && warnings.length === 0) {
    console.error(chalk.green.bold('  ✓ Context looks great!\n'));
  } else {
    console.error(chalk.bold(`  ${passes.length} passed · ${chalk.yellow(warnings.length + ' warnings')} · ${chalk.red(issues.length + ' errors')}\n`));
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
