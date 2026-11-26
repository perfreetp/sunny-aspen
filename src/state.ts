import type { ProjectDoc, Overrides, Solution, Warning } from './core/types';
import { buildLayout } from './core/layout';
import { solve } from './core/hydraulics';

export function compute(doc: ProjectDoc): Solution {
  const layout = buildLayout({
    params: doc.params,
    overrides: doc.overrides,
    seed: doc.seed,
  });
  return solve({ layout, params: doc.params });
}

const KEY = 'greenhouse-irrigation-schematic:v1';

export function loadDoc(): ProjectDoc | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectDoc;
    if (!parsed || parsed.version !== 1 || !parsed.params) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDoc(doc: ProjectDoc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function clearDoc() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function emptyOverrides(): Overrides {
  return { branchOffset: {}, branchSpacing: {}, branchDiameter: {} };
}

export function countOverrides(o: Overrides): number {
  return (
    Object.keys(o.branchOffset).length +
    Object.keys(o.branchSpacing).length +
    Object.keys(o.branchDiameter).length
  );
}

export function warningCounts(warnings: Warning[]) {
  let error = 0;
  let warn = 0;
  let info = 0;
  for (const w of warnings) {
    if (w.severity === 'error') error += 1;
    else if (w.severity === 'warn') warn += 1;
    else info += 1;
  }
  return { error, warn, info };
}
