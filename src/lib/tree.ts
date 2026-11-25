import type { GroupNode, ID, ProjectState, TrackNode } from '../types';
import { trackInterval } from './timing';

export function getNode(project: ProjectState, id: ID | null | undefined) {
  return id ? project.nodes[id] : undefined;
}

export function isTrack(node: unknown): node is TrackNode {
  return !!node && typeof node === 'object' && (node as { kind?: string }).kind === 'track';
}

export function isGroup(node: unknown): node is GroupNode {
  return !!node && typeof node === 'object' && (node as { kind?: string }).kind === 'group';
}

export function getParentMap(project: ProjectState): Map<ID, ID | null> {
  const parent = new Map<ID, ID | null>();
  const walk = (ids: ID[], p: ID | null) => {
    for (const id of ids) {
      parent.set(id, p);
      const node = project.nodes[id];
      if (isGroup(node)) walk(node.children, id);
    }
  };
  walk(project.rootIds, null);
  return parent;
}

export function findParentGroupId(project: ProjectState, trackId: ID): ID | null {
  return getParentMap(project).get(trackId) ?? null;
}

export function getDescendantIds(project: ProjectState, groupId: ID): ID[] {
  const group = project.nodes[groupId];
  if (!isGroup(group)) return [];
  const result: ID[] = [];
  const walk = (ids: ID[]) => {
    for (const id of ids) {
      result.push(id);
      const node = project.nodes[id];
      if (isGroup(node)) walk(node.children);
    }
  };
  walk(group.children);
  return result;
}

export function getDescendantTracks(project: ProjectState, nodeId: ID | null | undefined): TrackNode[] {
  if (!nodeId) return Object.values(project.nodes).filter(isTrack);
  const node = project.nodes[nodeId];
  if (!node) return [];
  if (isTrack(node)) return [node];
  return getDescendantIds(project, nodeId)
    .map((id) => project.nodes[id])
    .filter(isTrack);
}

export function getTimelineInterval(project: ProjectState, nodeId: ID | null | undefined): { start: number; end: number } {
  const tracks = getDescendantTracks(project, nodeId);
  if (tracks.length === 0) return { start: 0, end: 10 };
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const t of tracks) {
    const interval = trackInterval(t);
    start = Math.min(start, interval.start);
    end = Math.max(end, interval.end);
  }
  return { start, end };
}

export function getProjectDuration(project: ProjectState): number {
  const interval = getTimelineInterval(project, null);
  return Math.max(12, interval.end + 2);
}

export interface FlatRow {
  id: ID;
  depth: number;
  parentId: ID | null;
}

export function flattenVisibleRows(project: ProjectState): FlatRow[] {
  const parentMap = getParentMap(project);
  const rows: FlatRow[] = [];
  const walk = (ids: ID[], depth: number) => {
    for (const id of ids) {
      rows.push({ id, depth, parentId: parentMap.get(id) ?? null });
      const node = project.nodes[id];
      if (isGroup(node) && !node.collapsed) walk(node.children, depth + 1);
    }
  };
  walk(project.rootIds, 0);
  return rows;
}

/**
 * 以 anchor 为时间原点，把一个子树内所有已排时间等比缩放。
 * startDelay 属于设备参数，不参与编排关键帧缩放。
 */
export function scaleSubtreeTiming(node: GroupNode | ProjectState, project: ProjectState, anchor: number, ratio: number): void {
  const ids = 'rootIds' in node ? getAllIds(node) : getDescendantIds(project, node.id);
  for (const id of ids) {
    const n = project.nodes[id];
    if (!isTrack(n)) continue;
    n.start = anchor + (n.start - anchor) * ratio;
    n.openDuration = Math.max(1, n.openDuration * ratio);
    n.holdDuration = Math.max(0, n.holdDuration * ratio);
    n.closeDuration = Math.max(0.5, n.closeDuration * ratio);
    for (const pause of n.pauses) pause.duration = Math.max(0.4, pause.duration * ratio);
  }
}

function getAllIds(project: ProjectState): ID[] {
  return Object.keys(project.nodes);
}
