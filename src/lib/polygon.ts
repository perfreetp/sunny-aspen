import type { Point } from '../types';

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(points: Point[]): Point {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < 1e-6) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

export function simplifyPath(points: Point[], maxPoints = 22, minDistance = 18): Point[] {
  if (points.length <= maxPoints) return points.slice();
  const filtered: Point[] = [];
  for (const p of points) {
    const last = filtered[filtered.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDistance) filtered.push(p);
  }
  if (filtered.length > maxPoints) {
    const step = filtered.length / maxPoints;
    return Array.from({ length: maxPoints }, (_, i) => filtered[Math.floor(i * step)]);
  }
  return filtered;
}

function clipAgainstHorizontal(polygon: Point[], y: number, keepAbove: boolean): Point[] {
  const inside = (p: Point): boolean => (keepAbove ? p.y <= y : p.y >= y);
  const output: Point[] = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = inside(current);
    const nextInside = inside(next);

    if (currentInside && nextInside) {
      output.push(next);
    } else if (currentInside && !nextInside) {
      const t = (y - current.y) / (next.y - current.y || Number.EPSILON);
      output.push({ x: current.x + (next.x - current.x) * t, y });
    } else if (!currentInside && nextInside) {
      const t = (y - current.y) / (next.y - current.y || Number.EPSILON);
      output.push({ x: current.x + (next.x - current.x) * t, y });
      output.push(next);
    }
  }
  return output;
}

/** Clip a simple polygon to the horizontal band [top, bottom]. */
export function clipPolygonToBand(polygon: Point[], top: number, bottom: number): Point[] {
  let result = clipAgainstHorizontal(polygon, top, true);
  result = clipAgainstHorizontal(result, bottom, false);
  return result;
}

export function tracePoints(ctx: { moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void }, points: Point[]): void {
  if (!points.length) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[0].x, points[0].y);
}
