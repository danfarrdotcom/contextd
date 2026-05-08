import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

let tmpDir;
let configPath;

const originalHome = process.env.HOME;
const originalApiUrl = process.env.CONTEXTD_API_URL;

async function freshImport() {
  const mod = await import(`../../src/commands/auth.js?t=${Date.now()}`);
  return mod;
}

describe('auth - getToken', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contextd-auth-test-'));
    process.env.HOME = tmpDir;
    configPath = path.join(tmpDir, '.contextd', 'config.json');
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.CONTEXTD_API_URL = originalApiUrl;
    await fs.remove(tmpDir);
  });

  it('returns null when no config file exists', async () => {
    const { getToken } = await freshImport();
    const token = await getToken();
    assert.strictEqual(token, null);
  });

  it('returns the token from config file', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { token: 'ctxd_abc123', org: 'testorg' });
    const { getToken } = await freshImport();
    const token = await getToken();
    assert.strictEqual(token, 'ctxd_abc123');
  });

  it('returns null when config has no token field', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { org: 'testorg' });
    const { getToken } = await freshImport();
    const token = await getToken();
    assert.strictEqual(token, null);
  });
});

describe('auth - getConfig', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contextd-auth-test-'));
    process.env.HOME = tmpDir;
    configPath = path.join(tmpDir, '.contextd', 'config.json');
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.remove(tmpDir);
  });

  it('returns null when no config exists', async () => {
    const { getConfig } = await freshImport();
    const config = await getConfig();
    assert.strictEqual(config, null);
  });

  it('returns full config object', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { token: 'ctxd_abc', org: 'myorg' });
    const { getConfig } = await freshImport();
    const config = await getConfig();
    assert.deepStrictEqual(config, { token: 'ctxd_abc', org: 'myorg' });
  });
});

describe('auth - saveConfig', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contextd-auth-test-'));
    process.env.HOME = tmpDir;
    configPath = path.join(tmpDir, '.contextd', 'config.json');
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.remove(tmpDir);
  });

  it('creates config directory and file', async () => {
    const { saveConfig } = await freshImport();
    await saveConfig({ token: 'ctxd_new', org: 'neworg' });
    const saved = await fs.readJson(configPath);
    assert.strictEqual(saved.token, 'ctxd_new');
    assert.strictEqual(saved.org, 'neworg');
  });

  it('overwrites existing config', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { token: 'old', org: 'old' });
    const { saveConfig } = await freshImport();
    await saveConfig({ token: 'new', org: 'new' });
    const saved = await fs.readJson(configPath);
    assert.strictEqual(saved.token, 'new');
  });
});

describe('auth - createOrgAndKey', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.CONTEXTD_API_URL = 'https://test.example.com/v1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.CONTEXTD_API_URL = originalApiUrl;
  });

  it('posts to /orgs and returns the key', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.ok(url.endsWith('/orgs'));
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.slug, 'myorg');
      assert.strictEqual(body.keyName, 'laptop');
      return new Response(JSON.stringify({ org: { id: 'myorg' }, key: 'ctxd_returned' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { createOrgAndKey } = await freshImport();
    const key = await createOrgAndKey('myorg', 'laptop');
    assert.strictEqual(key, 'ctxd_returned');
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify({ error: 'Org already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { createOrgAndKey } = await freshImport();
    await assert.rejects(() => createOrgAndKey('myorg', 'laptop'), {
      message: 'Org already exists',
    });
  });

  it('throws statusText when body has no error field', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    const { createOrgAndKey } = await freshImport();
    await assert.rejects(() => createOrgAndKey('myorg', 'laptop'), {
      message: 'Internal Server Error',
    });
  });
});

describe('auth - createKey', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.CONTEXTD_API_URL = 'https://test.example.com/v1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.CONTEXTD_API_URL = originalApiUrl;
  });

  it('posts to /orgs/:org/keys with auth header', async () => {
    globalThis.fetch = mock.fn(async (url, opts) => {
      assert.ok(url.includes('/orgs/myorg/keys'));
      assert.strictEqual(opts.headers['Authorization'], 'Bearer ctxd_existing');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.name, 'laptop');
      return new Response(JSON.stringify({ id: 'key-id', key: 'ctxd_newkey' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { createKey } = await freshImport();
    const key = await createKey('myorg', 'laptop', 'ctxd_existing');
    assert.strictEqual(key, 'ctxd_newkey');
  });

  it('URL-encodes the org slug', async () => {
    globalThis.fetch = mock.fn(async (url) => {
      assert.ok(url.includes('/orgs/my%20org/keys'));
      return new Response(JSON.stringify({ id: 'id', key: 'ctxd_k' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { createKey } = await freshImport();
    await createKey('my org', 'laptop', 'ctxd_tok');
  });

  it('throws on auth failure', async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { createKey } = await freshImport();
    await assert.rejects(() => createKey('myorg', 'laptop', 'bad_token'), {
      message: 'Forbidden',
    });
  });
});

describe('auth - authCommand logout', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contextd-auth-test-'));
    process.env.HOME = tmpDir;
    configPath = path.join(tmpDir, '.contextd', 'config.json');
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.remove(tmpDir);
  });

  it('removes the config file', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { token: 'ctxd_abc', org: 'testorg' });
    const { authCommand } = await freshImport();
    await authCommand('logout');
    assert.strictEqual(await fs.pathExists(configPath), false);
  });

  it('succeeds even when no config exists', async () => {
    const { authCommand } = await freshImport();
    await authCommand('logout');
    assert.strictEqual(await fs.pathExists(configPath), false);
  });
});

describe('auth - authCommand status', () => {
  let exitCode;
  let originalExit;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contextd-auth-test-'));
    process.env.HOME = tmpDir;
    configPath = path.join(tmpDir, '.contextd', 'config.json');
    exitCode = null;
    originalExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
  });

  afterEach(async () => {
    process.exit = originalExit;
    process.env.HOME = originalHome;
    await fs.remove(tmpDir);
  });

  it('exits 1 when not authenticated', async () => {
    const { authCommand } = await freshImport();
    await assert.rejects(() => authCommand('status'), /process\.exit/);
    assert.strictEqual(exitCode, 1);
  });

  it('succeeds when config exists with token', async () => {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { token: 'ctxd_test', org: 'testorg' });
    const { authCommand } = await freshImport();
    await authCommand('status');
    assert.strictEqual(exitCode, null);
  });
});
