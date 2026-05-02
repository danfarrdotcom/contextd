import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import matter from 'gray-matter';
import { findRoot, CONTEXT_DIR } from '@danfarrdotcom/core';

const TODAY = new Date().toISOString().split('T')[0];

export async function decisionCommand(action, title) {
  const rootDir = await findRoot(process.cwd());

  if (!rootDir) {
    console.log(chalk.red('\n  ✗ No .context/ directory found. Run contextd init first.\n'));
    process.exit(1);
  }

  const decisionsDir = path.join(rootDir, CONTEXT_DIR, 'decisions');

  if (action === 'list') {
    await listDecisions(decisionsDir);
  } else if (action === 'add') {
    await addDecision(decisionsDir, title);
  } else {
    console.log(chalk.red(`\n  ✗ Unknown action: ${action}`));
    console.log(chalk.gray('  Usage: contextd decision add "Why we use tRPC"\n'));
  }
}

async function listDecisions(decisionsDir) {
  const files = await glob('*.md', { cwd: decisionsDir, absolute: true });

  if (files.length === 0) {
    console.log(chalk.yellow('\n  No decisions recorded yet.'));
    console.log(chalk.gray('  Add one: contextd decision add "Why we chose X"\n'));
    return;
  }

  console.log(chalk.bold('\n  Architecture Decisions\n'));

  for (const file of files.sort()) {
    const raw = await fs.readFile(file, 'utf-8');
    const { data: meta } = matter(raw);
    const num = path.basename(file, '.md').split('-')[0];
    const status = meta.status || 'accepted';
    const statusColor = status === 'accepted' ? chalk.green : status === 'deprecated' ? chalk.red : chalk.yellow;

    console.log(
      `  ${chalk.gray(num)}  ${meta.title || path.basename(file, '.md')}  ${statusColor(`[${status}]`)}`
    );
  }

  console.log('');
}

async function addDecision(decisionsDir, title) {
  if (!title) {
    console.log(chalk.red('\n  ✗ Please provide a title: contextd decision add "Why we use X"\n'));
    process.exit(1);
  }

  // Get next number
  const existing = await glob('*.md', { cwd: decisionsDir });
  const nums = existing
    .map(f => parseInt(f.split('-')[0]))
    .filter(n => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const paddedNum = String(nextNum).padStart(3, '0');

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `${paddedNum}-${slug}.md`;
  const filePath = path.join(decisionsDir, filename);

  const template = `---
title: "${title}"
date: ${TODAY}
status: accepted
tags: []
---

# ADR-${paddedNum}: ${title}

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult because of this change?

## Alternatives Considered
What other options did we evaluate?
`;

  await fs.writeFile(filePath, template);

  console.log(chalk.green(`\n  ✓ Created ${path.relative(process.cwd(), filePath)}`));
  console.log(chalk.gray(`  Fill in the context, decision, and consequences.\n`));
}
