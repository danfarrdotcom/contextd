import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { getContextStats, loadAllContext, ContextStats } from '@contextd/core';
import { glob } from 'glob';

export class HealthViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'contextd.healthView';

  private _view?: vscode.WebviewView;
  private rootDir: string | null = null;

  setRootDir(rootDir: string | null) {
    this.rootDir = rootDir;
    this.refresh();
  }

  refresh() {
    if (this._view) {
      this.updateContent();
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.updateContent();
  }

  private async updateContent() {
    if (!this._view) return;

    if (!this.rootDir) {
      this._view.webview.html = this.getNoContextHtml();
      return;
    }

    try {
      const stats = await getContextStats(this.rootDir);
      const issues = await this.getIssues(stats);
      this._view.webview.html = this.getHealthHtml(stats, issues);
    } catch (e) {
      this._view.webview.html = this.getErrorHtml(String(e));
    }
  }

  private async getIssues(stats: ContextStats): Promise<{ type: 'error' | 'warning' | 'pass'; message: string }[]> {
    const issues: { type: 'error' | 'warning' | 'pass'; message: string }[] = [];

    if (stats.hasProject) {
      issues.push({ type: 'pass', message: 'project.md exists' });
    } else {
      issues.push({ type: 'error', message: 'Missing project.md' });
    }

    if (stats.hasArchitecture) {
      issues.push({ type: 'pass', message: 'architecture.md exists' });
    } else {
      issues.push({ type: 'warning', message: 'No architecture.md' });
    }

    if (stats.hasConventions) {
      issues.push({ type: 'pass', message: 'conventions.md exists' });
    } else {
      issues.push({ type: 'warning', message: 'No conventions.md' });
    }

    if (stats.decisions > 0) {
      issues.push({ type: 'pass', message: `${stats.decisions} decision(s) recorded` });
    } else {
      issues.push({ type: 'warning', message: 'No architecture decisions yet' });
    }

    for (const stalePath of stats.stale) {
      const base = path.basename(stalePath);
      if (base !== '.gitkeep') {
        issues.push({ type: 'warning', message: `${base} may be stale` });
      }
    }

    return issues;
  }

  private getHealthHtml(stats: ContextStats, issues: { type: string; message: string }[]): string {
    const passes = issues.filter(i => i.type === 'pass').length;
    const warnings = issues.filter(i => i.type === 'warning').length;
    const errors = issues.filter(i => i.type === 'error').length;

    const score = Math.round((passes / issues.length) * 100);
    const scoreColor = score >= 80 ? '#4ec9b0' : score >= 50 ? '#dcdcaa' : '#f44747';

    const issueRows = issues.map(i => {
      const icon = i.type === 'pass' ? '✓' : i.type === 'warning' ? '⚠' : '✗';
      const color = i.type === 'pass' ? '#4ec9b0' : i.type === 'warning' ? '#dcdcaa' : '#f44747';
      return `<div class="issue"><span style="color:${color}">${icon}</span> <span>${i.message}</span></div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 8px; margin: 0; }
  .score { font-size: 2em; font-weight: bold; color: ${scoreColor}; margin: 8px 0 4px; }
  .subtitle { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 12px; }
  .stats { display: flex; gap: 12px; margin-bottom: 12px; }
  .stat { text-align: center; }
  .stat-num { font-size: 1.4em; font-weight: bold; }
  .stat-label { font-size: 0.75em; color: var(--vscode-descriptionForeground); }
  .issues { margin-top: 8px; }
  .issue { padding: 3px 0; display: flex; gap: 6px; align-items: flex-start; font-size: 0.9em; }
  .section-label { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin: 10px 0 4px; }
</style>
</head>
<body>
  <div class="score">${score}%</div>
  <div class="subtitle">Context health score</div>
  <div class="stats">
    <div class="stat">
      <div class="stat-num" style="color:#4ec9b0">${passes}</div>
      <div class="stat-label">passed</div>
    </div>
    <div class="stat">
      <div class="stat-num" style="color:#dcdcaa">${warnings}</div>
      <div class="stat-label">warnings</div>
    </div>
    <div class="stat">
      <div class="stat-num" style="color:#f44747">${errors}</div>
      <div class="stat-label">errors</div>
    </div>
    <div class="stat">
      <div class="stat-num">${stats.total}</div>
      <div class="stat-label">files</div>
    </div>
  </div>
  <div class="section-label">Checks</div>
  <div class="issues">${issueRows}</div>
</body>
</html>`;
  }

  private getNoContextHtml(): string {
    return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);color:var(--vscode-descriptionForeground);padding:8px;font-size:0.9em;">
      <p>No .context/ directory found.</p>
      <p>Run <strong>contextd: Initialize</strong> from the command palette.</p>
    </body></html>`;
  }

  private getErrorHtml(msg: string): string {
    return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);color:#f44747;padding:8px;font-size:0.9em;">
      <p>Error: ${msg}</p>
    </body></html>`;
  }
}
