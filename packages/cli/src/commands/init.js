import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { CONTEXT_DIR, findRoot } from '@contextd/core';

const TODAY = new Date().toISOString().split('T')[0];

const TEMPLATES = {
  'project.md': `---
title: Project Overview
updated: ${TODAY}
---

# Project Overview

## What is this?
<!-- Describe what this project does in 2-3 sentences -->

## Tech Stack
<!-- List your main technologies -->
- **Language**: 
- **Framework**: 
- **Database**: 
- **Deployment**: 

## Key Goals
<!-- What are you optimizing for? Performance? DX? Simplicity? -->

## What to avoid
<!-- Patterns, libraries, or approaches you've ruled out and why -->
`,

  'architecture.md': `---
title: Architecture
updated: ${TODAY}
---

# Architecture

## System Overview
<!-- High-level description of how the system is structured -->

## Directory Structure
\`\`\`
src/
  ├── ...   # describe key folders
\`\`\`

## Data Flow
<!-- How does data move through the system? -->

## Key Boundaries
<!-- What are the important separation of concerns? -->

## External Services
<!-- APIs, queues, storage services this system depends on -->
`,

  'conventions.md': `---
title: Coding Conventions
updated: ${TODAY}
---

# Coding Conventions

## Naming
<!-- Variable, file, function naming patterns -->

## File Organization
<!-- How should new files be structured? Where do things go? -->

## Patterns We Use
<!-- Design patterns, abstractions, or idioms preferred in this codebase -->

## Patterns We Avoid
<!-- Anti-patterns to watch out for -->

## Error Handling
<!-- How errors should be caught, logged, and surfaced -->

## Testing
<!-- Testing approach, what to test, what not to bother testing -->
`,

  'decisions/.gitkeep': '',
  'modules/.gitkeep': '',
};

const EXAMPLE_DECISION = `---
title: Example Decision
date: ${TODAY}
status: accepted
tags: []
---

# ADR-001: Example Decision

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult because of this change?
`;

export async function initCommand(options) {
  const cwd = process.cwd();
  const existing = await findRoot(cwd);

  if (existing) {
    console.log(chalk.yellow(`\n  ⚠  contextd already initialized at ${existing}\n`));
    return;
  }

  const contextDir = path.join(cwd, CONTEXT_DIR);
  const spinner = ora('Initializing contextd...').start();

  try {
    // Create directory structure
    await fs.ensureDir(path.join(contextDir, 'decisions'));
    await fs.ensureDir(path.join(contextDir, 'modules'));

    if (options.minimal) {
      // Just create project.md
      await fs.writeFile(path.join(contextDir, 'project.md'), TEMPLATES['project.md']);
    } else {
      // Create all template files
      for (const [filePath, content] of Object.entries(TEMPLATES)) {
        const fullPath = path.join(contextDir, filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content);
      }

      // Create example decision
      await fs.writeFile(
        path.join(contextDir, 'decisions', '001-example.md'),
        EXAMPLE_DECISION
      );
    }

    // Add .context/ exports to .gitignore patterns (but keep .context/ itself tracked)
    const gitignorePath = path.join(cwd, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const gitignore = await fs.readFile(gitignorePath, 'utf-8');
      if (!gitignore.includes('# contextd exports')) {
        await fs.appendFile(gitignorePath, '\n# contextd exports\nCLAUDE.md.generated\n.cursorrules.generated\n');
      }
    }

    spinner.succeed(chalk.green('contextd initialized!'));

    console.log(`
  ${chalk.bold('Created:')}
  ${chalk.gray(CONTEXT_DIR + '/')}
  ${chalk.gray('  project.md')}        ${chalk.dim('← describe your project')}
  ${chalk.gray('  architecture.md')}   ${chalk.dim('← system design')}  
  ${chalk.gray('  conventions.md')}    ${chalk.dim('← coding standards')}
  ${chalk.gray('  decisions/')}        ${chalk.dim('← architecture decisions (ADRs)')}
  ${chalk.gray('  modules/')}          ${chalk.dim('← per-folder context')}

  ${chalk.bold('Next steps:')}
  ${chalk.cyan('1.')} Fill in ${chalk.white('.context/project.md')} with your project details
  ${chalk.cyan('2.')} Run ${chalk.white('contextd export')} to generate your CLAUDE.md
  ${chalk.cyan('3.')} Commit ${chalk.white('.context/')} to share with your team

  ${chalk.dim('Tip: Run contextd check to see coverage gaps')}
`);
  } catch (err) {
    spinner.fail('Failed to initialize');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}
