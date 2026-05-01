#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const PACKAGES = {
  'packages/core': '@contextd/core',
  'packages/cli': 'contextd',
  'packages/vscode': 'contextd-vscode',
};

// Conventional commit types → bump level (omitted types produce no release)
const BUMP_BY_TYPE = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  refactor: 'patch',
};

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getCommits(base = 'origin/main') {
  try {
    return run(`git log ${base}..HEAD --format=%s`).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function parseCommit(msg) {
  const m = msg.match(/^(\w+)(\([^)]+\))?(!)?:\s*(.+)/);
  if (!m) return null;
  return {
    type: m[1],
    breaking: !!m[3] || msg.includes('BREAKING CHANGE'),
    description: m[4],
  };
}

function getChangedPackages() {
  try {
    const files = run('git diff --name-only origin/main..HEAD').split('\n');
    const changed = new Set();
    for (const file of files) {
      for (const [prefix, name] of Object.entries(PACKAGES)) {
        if (file.startsWith(prefix + '/')) changed.add(name);
      }
    }
    return [...changed];
  } catch {
    return Object.values(PACKAGES);
  }
}

function determineBump(commits) {
  let bump = null;
  for (const msg of commits) {
    const c = parseCommit(msg);
    if (!c) continue;
    if (c.breaking) return 'major';
    const b = BUMP_BY_TYPE[c.type];
    if (b === 'minor') bump = 'minor';
    else if (b === 'patch' && bump !== 'minor') bump = 'patch';
  }
  return bump;
}

function getSummary(commits) {
  const descs = commits
    .map(parseCommit)
    .filter(c => c && BUMP_BY_TYPE[c.type])
    .map(c => c.description);
  return descs[0] ?? 'Updates from conventional commits';
}

function hasManualChangeset() {
  const dir = '.changeset';
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some(
    f => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('auto-'),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const commits = getCommits();
if (!commits.length) {
  console.log('No commits vs origin/main — skipping.');
  process.exit(0);
}

if (hasManualChangeset()) {
  console.log('Manual changeset already present — skipping auto-generation.');
  process.exit(0);
}

const bump = determineBump(commits);
if (!bump) {
  console.log('Only non-releasable commits (chore/docs/test/style/ci) — skipping.');
  process.exit(0);
}

const packages = getChangedPackages();
if (!packages.length) {
  console.log('No packages changed — skipping.');
  process.exit(0);
}

// Use branch name as deterministic filename so re-runs overwrite, not duplicate
let slug;
try {
  const branch = run('git rev-parse --abbrev-ref HEAD');
  slug = branch.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
} catch {
  slug = Date.now().toString(36);
}

const changesetDir = '.changeset';
if (!existsSync(changesetDir)) mkdirSync(changesetDir);

const filename = join(changesetDir, `auto-${slug}.md`);
const frontmatter = packages.map(p => `"${p}": ${bump}`).join('\n');
const summary = getSummary(commits);

writeFileSync(filename, `---\n${frontmatter}\n---\n\n${summary}\n`);

console.log(`✓ Created ${filename}`);
console.log(`  packages : ${packages.join(', ')}`);
console.log(`  bump     : ${bump}`);
console.log(`  summary  : ${summary}`);
