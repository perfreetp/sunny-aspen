// Geometry and spatial-index helpers used by the Pixi view and the panels.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polygonBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsIntersect(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(ring) {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-6) {
    const b = polygonBounds(ring);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  return [cx / (3 * area2), cy / (3 * area2)];
}

export function pointToSegmentDistance(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 ? ((px - ax) * dx + (py - ay) * dy) / length2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, p) {
  return (
    p[0] <= Math.max(a[0], b[0]) + 1e-6 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-6 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-6 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-6
  );
}

export function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < 1e-7 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-7 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-7 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-7 && onSegment(c, d, b)) return true;
  return false;
}

export function rectIntersectsSegment(rect, a, b) {
  const { x, y, width, height } = rect;
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  if (
    a[0] >= left && a[0] <= right && a[1] >= top && a[1] <= bottom ||
    b[0] >= left && b[0] <= right && b[1] >= top && b[1] <= bottom
  ) {
    return true;
  }
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom]
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

export function polygonIntersectsRect(ring, rect) {
  const b = polygonBounds(ring);
  const r = {
    minX: rect.x - rect.width / 2,
    maxX: rect.x + rect.width / 2,
    minY: rect.y - rect.height / 2,
    maxY: rect.y + rect.height / 2
  };
  if (!boundsIntersect(b, r)) return false;
  if (pointInPolygon([rect.x, rect.y], ring)) return true;
  for (const p of ring) {
    if (p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minY && p[1] <= r.maxY) return true;
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b2 = ring[(i + 1) % ring.length];
    if (rectIntersectsSegment(rect, a, b2)) return true;
  }
  return false;
}

export function polygonsIntersect(a, b) {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  if (!boundsIntersect(ba, bb)) return false;
  for (const p of a) if (pointInPolygon(p, b)) return true;
  for (const p of b) if (pointInPolygon(p, a)) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

export function buildSpatialIndex(units, cellSize = 180) {
  const cells = new Map();
  units.forEach((unit, index) => {
    const b = unit.bounds || polygonBounds(unit.ring);
    unit.bounds = b;
    const x0 = Math.floor(b.minX / cellSize);
    const x1 = Math.floor(b.maxX / cellSize);
    const y0 = Math.floor(b.minY / cellSize);
    const y1 = Math.floor(b.maxY / cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx},${cy}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(index);
      }
    }
  });
  return { cellSize, cells };
}

export function querySpatialIndex(index, x, y) {
  const cx = Math.floor(x / index.cellSize);
  const cy = Math.floor(y / index.cellSize);
  return index.cells.get(`${cx},${cy}`) || [];
}

export function queryIndexBounds(index, bounds) {
  const x0 = Math.floor(bounds.minX / index.cellSize);
  const x1 = Math.floor(bounds.maxX / index.cellSize);
  const y0 = Math.floor(bounds.minY / index.cellSize);
  const y1 = Math.floor(bounds.maxY / index.cellSize);
  const result = new Set();
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const list = index.cells.get(`${cx},${cy}`);
      if (list) for (const id of list) result.add(id);
    }
  }
  return [...result];
}

export function formatCoord(value) {
  return `${Math.round(value).toString().padStart(4, '0')} m`;
}

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
