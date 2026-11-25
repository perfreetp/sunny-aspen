import type { Point } from '../types';
import { clamp } from './temperature';

export const DESIGN_W = 1040;
export const DESIGN_H = 680;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Geometry {
  cableIds: string[];
  layerCount: number;
  grid: Rect;
  chart: Rect;
  cableXs: number[];
  cableX: (index: number) => number;
  layerTop: (layer: number) => number;
  layerBottom: (layer: number) => number;
  layerCenter: (layer: number) => number;
  layerAtY: (y: number) => number | null;
  pointInGrid: (p: Point, margin?: number) => boolean;
}

function makeRect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function createGeometry(cableIds: string[], layerCountInput: number): Geometry {
  const layerCount = Math.max(1, Math.round(layerCountInput));
  const grid = makeRect(112, 158, 928, 558);
  const chart = makeRect(112, 218, 928, 438);
  const firstX = grid.left + 54;
  const lastX = grid.right - 54;
  const count = cableIds.length;

  const cableX = (index: number): number => {
    if (count <= 1) return (firstX + lastX) / 2;
    return firstX + (index * (lastX - firstX)) / (count - 1);
  };
  const cableXs = cableIds.map((_, index) => cableX(index));
  const bandHeight = grid.height / layerCount;

  const layerTop = (layer: number): number => grid.top + (layer - 1) * bandHeight;
  const layerBottom = (layer: number): number => grid.top + layer * bandHeight;
  const layerCenter = (layer: number): number => (layerTop(layer) + layerBottom(layer)) / 2;

  const layerAtY = (y: number): number | null => {
    if (y < grid.top || y > grid.bottom) return null;
    return clamp(Math.floor((y - grid.top) / bandHeight) + 1, 1, layerCount);
  };

  const pointInGrid = (p: Point, margin = 0): boolean =>
    p.x >= grid.left - margin &&
    p.x <= grid.right + margin &&
    p.y >= grid.top - margin &&
    p.y <= grid.bottom + margin;

  return {
    cableIds,
    layerCount,
    grid,
    chart,
    cableXs,
    cableX,
    layerTop,
    layerBottom,
    layerCenter,
    layerAtY,
    pointInGrid
  };
}
