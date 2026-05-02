import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { loadAllContext, AllContext, ContextFile } from '@danfarrdotcom/core';

export type TreeItemKind = 'section' | 'contextFile' | 'empty' | 'action';

export class ContextTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: TreeItemKind,
    public readonly filePath?: string,
    public readonly description?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = kind === 'contextFile' ? 'contextFile' : kind;

    if (kind === 'contextFile' && filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
      this.command = {
        command: 'contextd.openFile',
        title: 'Open',
        arguments: [filePath],
      };
      this.tooltip = filePath;
    }

    if (description) {
      this.description = description;
    }
  }
}

export class ContextTreeProvider implements vscode.TreeDataProvider<ContextTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootDir: string | null = null;
  private ctx: AllContext | null = null;

  constructor(private workspaceRoot: string | undefined) {}

  setRootDir(rootDir: string | null) {
    this.rootDir = rootDir;
    this.ctx = null;
    this.refresh();
  }

  refresh() {
    this.ctx = null;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: ContextTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContextTreeItem): Promise<ContextTreeItem[]> {
    if (!this.rootDir) {
      return [
        new ContextTreeItem(
          'No .context/ found',
          vscode.TreeItemCollapsibleState.None,
          'empty',
          undefined,
          'Run contextd: Initialize'
        ),
      ];
    }

    if (!this.ctx) {
      try {
        this.ctx = await loadAllContext(this.rootDir);
      } catch {
        return [
          new ContextTreeItem('Error loading context', vscode.TreeItemCollapsibleState.None, 'empty'),
        ];
      }
    }

    if (!element) {
      return this.getRootItems();
    }

    return this.getChildItems(element);
  }

  private getRootItems(): ContextTreeItem[] {
    if (!this.ctx) return [];

    const items: ContextTreeItem[] = [];

    // Core files section
    items.push(new ContextTreeItem('Core', vscode.TreeItemCollapsibleState.Expanded, 'section'));

    // Decisions section
    if (this.ctx.decisions.length > 0) {
      items.push(
        new ContextTreeItem(
          'Decisions',
          vscode.TreeItemCollapsibleState.Collapsed,
          'section',
          undefined,
          `${this.ctx.decisions.length}`
        )
      );
    }

    // Modules section
    if (this.ctx.modules.length > 0) {
      items.push(
        new ContextTreeItem(
          'Modules',
          vscode.TreeItemCollapsibleState.Collapsed,
          'section',
          undefined,
          `${this.ctx.modules.length}`
        )
      );
    }

    return items;
  }

  private getChildItems(element: ContextTreeItem): ContextTreeItem[] {
    if (!this.ctx) return [];

    if (element.label === 'Core') {
      const coreFiles: (ContextFile | undefined)[] = [
        this.ctx.project,
        this.ctx.architecture,
        this.ctx.conventions,
      ];

      return coreFiles
        .filter((f): f is ContextFile => !!f)
        .map(f => {
          const label = f.meta.title || path.basename(f.path, '.md');
          const isStale = !f.meta.updated;
          return new ContextTreeItem(
            label,
            vscode.TreeItemCollapsibleState.None,
            'contextFile',
            f.path,
            isStale ? '⚠ unfilled' : undefined
          );
        });
    }

    if (element.label === 'Decisions') {
      return this.ctx.decisions.map(f => {
        const num = path.basename(f.path, '.md').split('-')[0];
        return new ContextTreeItem(
          f.meta.title,
          vscode.TreeItemCollapsibleState.None,
          'contextFile',
          f.path,
          `ADR-${num}`
        );
      });
    }

    if (element.label === 'Modules') {
      return this.ctx.modules.map(f =>
        new ContextTreeItem(
          f.meta.scope || f.meta.title,
          vscode.TreeItemCollapsibleState.None,
          'contextFile',
          f.path
        )
      );
    }

    return [];
  }
}
