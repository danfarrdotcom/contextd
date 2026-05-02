import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline/promises';

const CONFIG_PATH = path.join(process.env.HOME || '~', '.contextd', 'config.json');
const API_BASE = process.env.CONTEXTD_API_URL || 'https://contextd-worker.workers.dev/v1';

export async function getToken() {
  if (!await fs.pathExists(CONFIG_PATH)) return null;
  const config = await fs.readJson(CONFIG_PATH);
  return config.token || null;
}

export async function authCommand(action) {
  if (action === 'logout') {
    await fs.remove(CONFIG_PATH);
    console.log(chalk.green('\n  Logged out.\n'));
    return;
  }

  if (action !== 'login') {
    console.log(chalk.red(`\n  Unknown action: ${action}. Use login or logout.\n`));
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const orgSlug = await rl.question(chalk.cyan('  Org slug (e.g. acme): '));
    const keyName = await rl.question(chalk.cyan('  Key name (e.g. laptop): '));
    const existingToken = await rl.question(
      chalk.cyan('  Existing API key (leave blank to create a new org): ')
    );

    const spinner = ora('Authenticating...').start();

    let key;
    if (existingToken.trim()) {
      const res = await fetch(`${API_BASE}/orgs/${orgSlug}/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${existingToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: keyName }),
      });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch {}
        spinner.fail('Authentication failed');
        console.log(chalk.red(`\n  ${body.error || res.statusText}\n`));
        process.exit(1);
      }
      const data = await res.json();
      key = data.key;
    } else {
      const res = await fetch(`${API_BASE}/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: orgSlug, name: orgSlug, keyName }),
      });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch {}
        spinner.fail('Failed to create org');
        console.log(chalk.red(`\n  ${body.error || res.statusText}\n`));
        process.exit(1);
      }
      const data = await res.json();
      key = data.key;
    }

    await fs.ensureDir(path.dirname(CONFIG_PATH));
    await fs.writeJson(CONFIG_PATH, { token: key, org: orgSlug }, { spaces: 2 });

    spinner.succeed(chalk.green('Authenticated!'));
    console.log(chalk.gray(`\n  Config saved to ${CONFIG_PATH}`));
    console.log(chalk.yellow(`  Save your key somewhere safe — it won't be shown again.\n`));
  } finally {
    rl.close();
  }
}
