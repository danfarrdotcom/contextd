import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline/promises';

export const CONFIG_PATH = path.join(process.env.HOME || '~', '.contextd', 'config.json');
export const API_BASE = process.env.CONTEXTD_API_URL || 'https://contextd-worker.dan-farr6298.workers.dev/v1';

export async function getToken() {
  if (!await fs.pathExists(CONFIG_PATH)) return null;
  const config = await fs.readJson(CONFIG_PATH);
  return config.token || null;
}

export async function getConfig() {
  if (!await fs.pathExists(CONFIG_PATH)) return null;
  return fs.readJson(CONFIG_PATH);
}

export async function saveConfig(config) {
  await fs.ensureDir(path.dirname(CONFIG_PATH));
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

export async function createOrgAndKey(orgSlug, keyName) {
  const res = await fetch(`${API_BASE}/orgs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: orgSlug, name: orgSlug, keyName }),
  });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch {}
    throw new Error(body.error || res.statusText);
  }
  const data = await res.json();
  return data.key;
}

export async function createKey(orgSlug, keyName, existingToken) {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgSlug)}/keys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${existingToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: keyName }),
  });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch {}
    throw new Error(body.error || res.statusText);
  }
  const data = await res.json();
  return data.key;
}

function promptWithClose(rl, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onClose = () => {
      if (!settled) {
        settled = true;
        reject(new Error('Input stream closed unexpectedly'));
      }
    };
    rl.once('close', onClose);
    rl.question(message).then(
      (answer) => { settled = true; rl.removeListener('close', onClose); resolve(answer); },
      (err) => { settled = true; rl.removeListener('close', onClose); reject(err); },
    );
  });
}

export async function authCommand(action) {
  if (action === 'status') {
    const config = await getConfig();
    if (!config || !config.token) {
      console.error(chalk.yellow('\n  Not authenticated. Run contextd auth login.\n'));
      process.exit(1);
    }
    console.error(chalk.green('\n  Authenticated'));
    console.error(chalk.gray(`  Org: ${config.org}`));
    console.error(chalk.gray(`  Config: ${CONFIG_PATH}\n`));
    return;
  }

  if (action === 'logout') {
    await fs.remove(CONFIG_PATH);
    console.error(chalk.green('\n  Logged out.\n'));
    return;
  }

  if (action !== 'login') {
    console.error(chalk.red(`\n  Unknown action: ${action}. Use login, logout, or status.\n`));
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const orgSlug = await promptWithClose(rl, chalk.cyan('  Org slug (e.g. acme): '));
    if (!orgSlug.trim()) {
      console.error(chalk.red('\n  Org slug is required.\n'));
      process.exit(1);
    }

    const keyName = await promptWithClose(rl, chalk.cyan('  Key name (e.g. laptop): '));
    const existingToken = await promptWithClose(
      rl, chalk.cyan('  Existing API key (leave blank to create a new org): ')
    );

    rl.close();

    const spinner = ora('Authenticating...').start();

    let key;
    try {
      if (existingToken.trim()) {
        key = await createKey(orgSlug.trim(), keyName.trim(), existingToken.trim());
      } else {
        key = await createOrgAndKey(orgSlug.trim(), keyName.trim());
      }
    } catch (err) {
      spinner.fail(existingToken.trim() ? 'Authentication failed' : 'Failed to create org');
      console.error(chalk.red(`\n  ${err.message}\n`));
      process.exit(1);
    }

    await saveConfig({ token: key, org: orgSlug.trim() });

    spinner.succeed(chalk.green('Authenticated!'));
    console.error(chalk.gray(`\n  Config saved to ${CONFIG_PATH}`));
    console.error(chalk.yellow(`  Save your key somewhere safe — it won't be shown again.\n`));
  } catch (err) {
    if (err.message === 'Input stream closed unexpectedly') {
      console.error(chalk.red('\n  Login cancelled.\n'));
      process.exit(1);
    }
    throw err;
  } finally {
    rl.close();
  }
}
