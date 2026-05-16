import * as path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';
import * as fs from 'fs-extra';
import { CONTEXT_DIR, ContextFile } from './context.js';

export interface CoverageMapping {
  contextPath: string;
  covers: string[];
  source: 'explicit' | 'inferred';
}

export interface StalenessInfo {
  contextPath: string;
  covers: string[];
  coverageSource: 'explicit' | 'inferred';
  contextLastUpdated: number | null;
  codeLastChanged: number | null;
  stale: boolean;
  staleDays: number | null;
  changedFiles: number;
  severity: 'fresh' | 'warning' | 'stale';
}

export interface StalenessReport {
  items: StalenessInfo[];
  staleCount: number;
  warningCount: number;
  freshCount: number;
}

function gitTimestamp(rootDir: string, filePaths: string | string[]): number | null {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  try {
    const result = execSync(
      `git log -1 --format=%ct -- ${paths.map(p => `"${p}"`).join(' ')}`,
      { cwd: rootDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return result ? parseInt(result, 10) : null;
  } catch {
    return null;
  }
}

function gitDiffStat(rootDir: string, sinceTimestamp: number, paths: string[]): number {
  if (!paths.length) return 0;
  try {
    const since = new Date(sinceTimestamp * 1000).toISOString();
    const result = execSync(
      `git log --since="${since}" --format="" --numstat -- ${paths.map(p => `"${p}"`).join(' ')}`,
      { cwd: rootDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!result) return 0;
    return result.split('\n').length;
  } catch {
    return 0;
  }
}

export function getCoverageMap(rootDir: string, contextFile: ContextFile): CoverageMapping {
  const raw = fs.readFileSync(contextFile.path, 'utf-8');
  const { data } = matter(raw);

  if (data.covers && Array.isArray(data.covers) && data.covers.length > 0) {
    return {
      contextPath: contextFile.path,
      covers: data.covers,
      source: 'explicit',
    };
  }

  const inferred = inferCoverage(rootDir, contextFile);
  return {
    contextPath: contextFile.path,
    covers: inferred,
    source: 'inferred',
  };
}

function inferCoverage(rootDir: string, contextFile: ContextFile): string[] {
  const rel = path.relative(path.join(rootDir, CONTEXT_DIR), contextFile.path);

  if (rel.startsWith('modules/')) {
    const scope = contextFile.meta.scope;
    if (scope) return [`${scope}/**`];
    const moduleName = path.basename(contextFile.path, '.md');
    const candidates = ['src', 'app', 'lib', 'packages', 'services', 'api', 'components'];
    for (const dir of candidates) {
      const candidate = path.join(rootDir, dir, moduleName);
      if (fs.existsSync(candidate)) return [`${dir}/${moduleName}/**`];
    }
    return [`**/${moduleName}/**`];
  }

  if (rel === 'conventions.md') return ['src/**', 'app/**', 'lib/**', 'packages/**'];
  if (rel === 'architecture.md') return ['src/**', 'app/**', 'lib/**', 'packages/**'];
  if (rel === 'project.md') return [];

  if (rel.startsWith('decisions/')) return [];

  return [];
}

export function getStalenessInfo(rootDir: string, contextFile: ContextFile): StalenessInfo {
  const coverage = getCoverageMap(rootDir, contextFile);

  if (coverage.covers.length === 0) {
    return {
      contextPath: contextFile.path,
      covers: [],
      coverageSource: coverage.source,
      contextLastUpdated: null,
      codeLastChanged: null,
      stale: false,
      staleDays: null,
      changedFiles: 0,
      severity: 'fresh',
    };
  }

  const contextUpdated = gitTimestamp(rootDir, contextFile.path);
  const codeChanged = gitTimestamp(rootDir, coverage.covers);

  if (!contextUpdated || !codeChanged) {
    return {
      contextPath: contextFile.path,
      covers: coverage.covers,
      coverageSource: coverage.source,
      contextLastUpdated: contextUpdated,
      codeLastChanged: codeChanged,
      stale: false,
      staleDays: null,
      changedFiles: 0,
      severity: 'fresh',
    };
  }

  const staleDays = codeChanged > contextUpdated
    ? Math.floor((codeChanged - contextUpdated) / 86400)
    : null;

  const changedFiles = codeChanged > contextUpdated
    ? gitDiffStat(rootDir, contextUpdated, coverage.covers)
    : 0;

  let severity: 'fresh' | 'warning' | 'stale';
  if (!staleDays || staleDays < 7) {
    severity = 'fresh';
  } else if (staleDays < 30 || changedFiles < 10) {
    severity = 'warning';
  } else {
    severity = 'stale';
  }

  return {
    contextPath: contextFile.path,
    covers: coverage.covers,
    coverageSource: coverage.source,
    contextLastUpdated: contextUpdated,
    codeLastChanged: codeChanged,
    stale: severity !== 'fresh',
    staleDays,
    changedFiles,
    severity,
  };
}

export function getStalenessReport(rootDir: string, contextFiles: ContextFile[]): StalenessReport {
  const items = contextFiles
    .filter(f => !f.path.includes('/remote/'))
    .map(f => getStalenessInfo(rootDir, f));

  return {
    items,
    staleCount: items.filter(i => i.severity === 'stale').length,
    warningCount: items.filter(i => i.severity === 'warning').length,
    freshCount: items.filter(i => i.severity === 'fresh').length,
  };
}
