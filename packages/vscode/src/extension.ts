import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { glob } from 'glob';

import {
  findRoot,
  loadAllContext,
  getRelevantContext,
  buildExportOutput,
  CONTEXT_DIR,
} from '@danfarrdotcom/core';
import { ContextTreeProvider } from './treeProvider';
import { HealthViewProvider } from './healthView';

const TODAY = new Date().toISOString().split('T')[0];

// Templates (same as CLI)
const TEMPLATES: Record<string, string> = {
  'project.md': `---\ntitle: Project Overview\nupdated: ${TODAY}\n---\n\n# Project Overview\n\n## What is this?\n\n## Tech Stack\n- **Language**: \n- **Framework**: \n- **Database**: \n\n## Key Goals\n\n## What to avoid\n`,
  'architecture.md': `---\ntitle: Architecture\nupdated: ${TODAY}\n---\n\n# Architecture\n\n## System Overview\n\n## Directory Structure\n\n## Data Flow\n\n## External Services\n`,
  'conventions.md': `---\ntitle: Coding Conventions\nupdated: ${TODAY}\n---\n\n# Coding Conventions\n\n## Naming\n\n## File Organization\n\n## Patterns We Use\n\n## Patterns We Avoid\n\n## Error Handling\n\n## Testing\n`,
};

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // --- Providers ---
  const treeProvider = new ContextTreeProvider(workspaceRoot);
  const healthProvider = new HealthViewProvider();

  vscode.window.registerTreeDataProvider('contextd.contextTree', treeProvider);
  vscode.window.registerWebviewViewProvider(HealthViewProvider.viewType, healthProvider);

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'contextd.check';
  statusBar.tooltip = 'contextd — click to check context health';
  context.subscriptions.push(statusBar);

  // --- Initialize root ---
  async function detectAndSetRoot() {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    treeProvider.setRootDir(root);
    healthProvider.setRootDir(root);

    const config = vscode.workspace.getConfiguration('contextd');
    if (config.get('showStatusBar')) {
      if (root) {
        statusBar.text = '$(layers) contextd';
        statusBar.show();
      } else {
        statusBar.text = '$(layers) contextd: not initialized';
        statusBar.show();
      }
    }
  }

  await detectAndSetRoot();

  // Watch for .context/ changes
  if (workspaceRoot) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, '.context/**/*.md')
    );
    watcher.onDidChange(() => { treeProvider.refresh(); healthProvider.refresh(); });
    watcher.onDidCreate(() => { treeProvider.refresh(); healthProvider.refresh(); autoExport(workspaceRoot); });
    watcher.onDidDelete(() => { treeProvider.refresh(); healthProvider.refresh(); });
    context.subscriptions.push(watcher);
  }

  // --- Commands ---

  // Init
  context.subscriptions.push(vscode.commands.registerCommand('contextd.init', async () => {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('contextd: No workspace folder open.');
      return;
    }

    const existing = await findRoot(workspaceRoot);
    if (existing) {
      vscode.window.showInformationMessage('contextd: Already initialized in this project.');
      return;
    }

    const contextDir = path.join(workspaceRoot, CONTEXT_DIR);

    await fs.ensureDir(path.join(contextDir, 'decisions'));
    await fs.ensureDir(path.join(contextDir, 'modules'));

    for (const [file, content] of Object.entries(TEMPLATES)) {
      await fs.writeFile(path.join(contextDir, file), content);
    }

    await detectAndSetRoot();

    const choice = await vscode.window.showInformationMessage(
      'contextd initialized! Open project.md to get started.',
      'Open project.md'
    );

    if (choice === 'Open project.md') {
      const doc = await vscode.workspace.openTextDocument(path.join(contextDir, 'project.md'));
      await vscode.window.showTextDocument(doc);
    }
  }));

  // Open file
  context.subscriptions.push(vscode.commands.registerCommand('contextd.openFile', async (filePath: string) => {
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  }));

  // Refresh
  context.subscriptions.push(vscode.commands.registerCommand('contextd.refreshTree', () => {
    treeProvider.refresh();
    healthProvider.refresh();
  }));

  // Export
  context.subscriptions.push(vscode.commands.registerCommand('contextd.export', async () => {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    if (!root) {
      vscode.window.showErrorMessage('contextd: No .context/ directory found. Run contextd: Initialize first.');
      return;
    }

    const config = vscode.workspace.getConfiguration('contextd');
    const defaultFormat = config.get<string>('defaultExportFormat', 'claude-md');

    const format = await vscode.window.showQuickPick(
      [
        { label: '$(file) CLAUDE.md', description: 'For Claude Code', value: 'claude-md' },
        { label: '$(file) .cursorrules', description: 'For Cursor', value: 'cursorrules' },
        { label: '$(terminal) Raw output', description: 'Copy to clipboard', value: 'raw' },
      ],
      { placeHolder: 'Choose export format', title: 'contextd: Export' }
    );

    if (!format) return;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'contextd: Exporting...' },
      async () => {
        const ctx = await loadAllContext(root);
        const output = buildExportOutput(ctx.all, format.value);

        if (format.value === 'raw') {
          await vscode.env.clipboard.writeText(output);
          vscode.window.showInformationMessage('contextd: Context copied to clipboard!');
          return;
        }

        const fileName = format.value === 'claude-md' ? 'CLAUDE.md' : '.cursorrules';
        const outPath = path.join(root, fileName);
        await fs.writeFile(outPath, output);

        const choice = await vscode.window.showInformationMessage(
          `contextd: Exported to ${fileName}`,
          'Open file'
        );
        if (choice === 'Open file') {
          const doc = await vscode.workspace.openTextDocument(outPath);
          await vscode.window.showTextDocument(doc);
        }
      }
    );
  }));

  // Check health
  context.subscriptions.push(vscode.commands.registerCommand('contextd.check', async () => {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    if (!root) {
      vscode.window.showErrorMessage('contextd: No .context/ directory found.');
      return;
    }
    healthProvider.refresh();
    await vscode.commands.executeCommand('contextd.healthView.focus');
    vscode.window.showInformationMessage('contextd: Health view updated.');
  }));

  // Add decision
  context.subscriptions.push(vscode.commands.registerCommand('contextd.addDecision', async () => {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    if (!root) {
      vscode.window.showErrorMessage('contextd: No .context/ directory found.');
      return;
    }

    const title = await vscode.window.showInputBox({
      prompt: 'What decision are you recording?',
      placeHolder: 'e.g. Why we use tRPC instead of REST',
      title: 'contextd: Add Architecture Decision',
    });

    if (!title) return;

    const decisionsDir = path.join(root, CONTEXT_DIR, 'decisions');
    const existing = await glob('*.md', { cwd: decisionsDir });
    const nums = existing.map(f => parseInt(f.split('-')[0])).filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const paddedNum = String(nextNum).padStart(3, '0');
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${paddedNum}-${slug}.md`;
    const filePath = path.join(decisionsDir, filename);

    const content = `---\ntitle: "${title}"\ndate: ${TODAY}\nstatus: accepted\ntags: []\n---\n\n# ADR-${paddedNum}: ${title}\n\n## Context\nWhat is the issue that is motivating this decision?\n\n## Decision\nWhat are we doing?\n\n## Consequences\nWhat becomes easier or harder?\n\n## Alternatives Considered\n`;

    await fs.writeFile(filePath, content);
    treeProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  }));

  // Add module context for current file
  context.subscriptions.push(vscode.commands.registerCommand('contextd.addModuleContext', async () => {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    if (!root) {
      vscode.window.showErrorMessage('contextd: No .context/ directory found.');
      return;
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activeFile) {
      vscode.window.showErrorMessage('contextd: No active file.');
      return;
    }

    const relativePath = path.relative(root, activeFile);
    const parts = relativePath.split(path.sep);
    const suggestedScope = parts.slice(0, 2).join('/');

    const scope = await vscode.window.showInputBox({
      prompt: 'What directory should this module context cover?',
      value: suggestedScope,
      title: 'contextd: Add Module Context',
    });

    if (!scope) return;

    const moduleName = scope.replace(/\//g, '-').replace(/[^a-z0-9-]/gi, '');
    const filePath = path.join(root, CONTEXT_DIR, 'modules', `${moduleName}.md`);

    if (await fs.pathExists(filePath)) {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
      return;
    }

    const content = `---\ntitle: ${moduleName} Module\nscope: ${scope}\nupdated: ${TODAY}\n---\n\n# ${moduleName} Module\n\n## Purpose\nWhat does this module/directory do?\n\n## Key patterns\nHow is code in this area typically structured?\n\n## What to watch out for\nGotchas, rules, or conventions specific to this module.\n`;

    await fs.writeFile(filePath, content);
    treeProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  }));

  // Copy relevant context for current file
  context.subscriptions.push(vscode.commands.registerCommand('contextd.copyContextForFile', async () => {
    const root = workspaceRoot ? await findRoot(workspaceRoot) : null;
    if (!root) {
      vscode.window.showErrorMessage('contextd: No .context/ directory found.');
      return;
    }

    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const filePaths = activeFile ? [activeFile] : [];

    const contexts = await getRelevantContext(root, filePaths);
    const output = buildExportOutput(contexts, 'raw');

    await vscode.env.clipboard.writeText(output);

    const fileName = activeFile ? path.basename(activeFile) : 'current file';
    vscode.window.showInformationMessage(
      `contextd: Copied ${contexts.length} context files relevant to ${fileName}`
    );
  }));
}

async function autoExport(workspaceRoot: string) {
  const config = vscode.workspace.getConfiguration('contextd');
  if (!config.get('autoExportOnSave')) return;

  const root = await findRoot(workspaceRoot);
  if (!root) return;

  const format = config.get<string>('defaultExportFormat', 'claude-md');
  const fileName = format === 'cursorrules' ? '.cursorrules' : 'CLAUDE.md';

  try {
    const ctx = await loadAllContext(root);
    const output = buildExportOutput(ctx.all, format);
    await fs.writeFile(path.join(root, fileName), output);
  } catch {
    // Silently fail for auto-export
  }
}

export function deactivate() {}
