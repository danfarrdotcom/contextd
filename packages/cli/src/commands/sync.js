import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  findRoot,
  loadSourcesConfig,
  writeSourcesConfig,
  parseSourceUrl,
  syncSource,
} from '@danfarrdotcom/core';
import { getToken } from './auth.js';

export async function syncCommand(action, args, options) {
  const rootDir = await findRoot(process.cwd());
  if (!rootDir) {
    console.error(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  switch (action) {
    case 'add': return syncAdd(rootDir, args[0], options);
    case 'remove': return syncRemove(rootDir, args[0]);
    case 'list': return syncList(rootDir);
    case 'now': return syncNow(rootDir, options);
    case 'publish': return syncPublish(rootDir, options);
    default:
      console.error(chalk.red(`\n  Unknown sync action: ${action}\n`));
      console.error(chalk.gray('  Available: add, remove, list, now, publish\n'));
      process.exit(1);
  }
}

async function syncAdd(rootDir, url, options) {
  if (!url) {
    console.error(chalk.red('\n  Usage: contextd sync add <url>\n'));
    process.exit(1);
  }

  const parsed = parseSourceUrl(url, process.env.CONTEXTD_API_URL);
  if (!parsed) {
    console.error(chalk.red(`\n  Invalid URL: ${url}`));
    console.error(chalk.gray('  Expected: contextd://org/collection or https://...\n'));
    process.exit(1);
  }

  const config = await loadSourcesConfig(rootDir);
  const name = `${parsed.org}/${parsed.collection}`;

  if (config.sources.find(s => s.name === name)) {
    console.error(chalk.yellow(`\n  Already subscribed to ${name}\n`));
    return;
  }

  const filters = {};
  const urlObj = url.startsWith('contextd://')
    ? new URL(url.replace('contextd://', 'https://'))
    : new URL(url);
  const urlType = urlObj.searchParams.get('type');
  const urlTags = urlObj.searchParams.get('tags');
  if (options.type || urlType) filters.type = options.type || urlType;
  if (options.tags || urlTags) filters.tags = (options.tags || urlTags).split(',');

  const cleanUrl = url.split('?')[0];

  config.sources.push({
    name,
    url: cleanUrl,
    filters: Object.keys(filters).length ? filters : undefined,
    last_synced: null,
  });

  await writeSourcesConfig(rootDir, config);
  console.error(chalk.green(`\n  ✓ Subscribed to ${name}`));
  console.error(chalk.gray('  Run contextd sync now to fetch contexts.\n'));
}

async function syncRemove(rootDir, name) {
  if (!name) {
    console.error(chalk.red('\n  Usage: contextd sync remove <name>\n'));
    process.exit(1);
  }

  const config = await loadSourcesConfig(rootDir);
  const before = config.sources.length;
  config.sources = config.sources.filter(s => s.name !== name);

  if (config.sources.length === before) {
    console.error(chalk.yellow(`\n  No subscription named ${name}\n`));
    return;
  }

  await writeSourcesConfig(rootDir, config);
  console.error(chalk.green(`\n  ✓ Removed ${name}\n`));
}

async function syncList(rootDir) {
  const config = await loadSourcesConfig(rootDir);
  if (config.sources.length === 0) {
    console.error(chalk.gray('\n  No remote sources. Add one with: contextd sync add <url>\n'));
    return;
  }
  console.error(chalk.bold('\n  Remote sources:\n'));
  for (const s of config.sources) {
    const age = s.last_synced
      ? chalk.gray(`(last synced ${new Date(s.last_synced).toLocaleDateString()})`)
      : chalk.yellow('(never synced)');
    console.error(`  ${chalk.cyan(s.name)} ${age}`);
    if (s.filters && Object.keys(s.filters).length) {
      console.error(chalk.gray(`    filters: ${JSON.stringify(s.filters)}`));
    }
  }
  console.error();
}

export async function syncNow(rootDir, options = {}) {
  const config = await loadSourcesConfig(rootDir);
  if (config.sources.length === 0) {
    if (!options.silent) console.error(chalk.gray('\n  No remote sources configured.\n'));
    return;
  }

  const token = await getToken();
  let updated = false;

  for (const source of config.sources) {
    const spinner = ora(`Syncing ${source.name}...`).start();
    try {
      const { synced, errors } = await syncSource(rootDir, source, token || undefined);
      source.last_synced = new Date().toISOString();
      spinner.succeed(chalk.green(`${source.name}: ${synced} contexts synced`));
      if (errors.length) {
        errors.forEach(e => console.error(chalk.yellow(`    ⚠ ${e}`)));
      }
      updated = true;
    } catch (err) {
      spinner.fail(`${source.name}: ${err.message}`);
    }
  }

  if (updated) await writeSourcesConfig(rootDir, config);
}

async function syncPublish(rootDir, options) {
  const token = await getToken();
  if (!token) {
    console.error(chalk.red('\n  ✗ Not authenticated. Run contextd auth login first.\n'));
    process.exit(1);
  }

  const { loadAllContext } = await import('@danfarrdotcom/core');
  const ctx = await loadAllContext(rootDir);

  const config = await loadSourcesConfig(rootDir);
  const targetName = options.target || config.sources.find(s => s.name)?.name;
  if (!targetName) {
    console.error(chalk.red('\n  ✗ No target. Add a source first or use --target org/collection\n'));
    process.exit(1);
  }

  const [org, collection] = targetName.split('/');
  const apiBase = process.env.CONTEXTD_API_URL || 'https://contextd-worker.dan-farr6298.workers.dev/v1';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const toPublish = ctx.all.filter(c => !c.path.includes('/remote/'));
  let pushed = 0;
  let skipped = 0;

  console.error(chalk.bold(`\n  Publishing to ${targetName}${options.dryRun ? ' (dry run)' : ''}...\n`));

  for (const context of toPublish) {
    const slug = path.basename(context.path, '.md');
    const type = context.meta?.type
      || (context.path.includes('/decisions/') ? 'decision'
      : context.path.includes('/modules/') ? 'module'
      : 'context');

    if (options.dryRun) {
      console.error(chalk.gray(`  would push: ${slug} (${type})`));
      skipped++;
      continue;
    }

    const spinner = ora(`Pushing ${slug}...`).start();
    try {
      const res = await fetch(`${apiBase}/orgs/${org}/${collection}/contexts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug,
          type,
          title: context.meta.title,
          content: context.content,
          tags: context.meta.tags || [],
          scope: context.meta.scope || undefined,
          priority: context.meta.priority,
        }),
      });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch {}
        spinner.fail(`${slug}: ${body.error || res.statusText}`);
      } else {
        spinner.succeed(chalk.green(slug));
        pushed++;
      }
    } catch (err) {
      spinner.fail(`${slug}: ${err.message}`);
    }
  }

  console.error(chalk.bold(`\n  Done. ${pushed} pushed, ${skipped} skipped.\n`));
}
