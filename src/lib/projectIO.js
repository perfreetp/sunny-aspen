import { PERIODS, WORLD, CONE_CENTER } from './sampleProject.js';
import { polygonBounds, polygonCentroid, downloadBlob } from './geo.js';

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function iterCoordinates(geometry, callback) {
  if (!geometry) return;
  if (geometry.type === 'Point') callback(geometry.coordinates);
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') geometry.coordinates.forEach(callback);
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') geometry.coordinates.forEach((part) => part.forEach(callback));
  if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(callback)));
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((g) => iterCoordinates(g, callback));
}

function createTransform(bounds) {
  const margin = 170;
  const dataW = Math.max(1e-6, bounds.maxX - bounds.minX);
  const dataH = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((WORLD.width - margin * 2) / dataW, (WORLD.height - margin * 2) / dataH);
  const drawW = dataW * scale;
  const drawH = dataH * scale;
  const left = (WORLD.width - drawW) / 2;
  const top = (WORLD.height - drawH) / 2;
  return ([x, y]) => [left + (x - bounds.minX) * scale, top + (bounds.maxY - y) * scale];
}

function featureRings(feature, transform) {
  const geom = feature.geometry;
  const rings = [];
  if (geom?.type === 'Polygon') {
    rings.push(geom.coordinates[0].map(transform));
  } else if (geom?.type === 'MultiPolygon') {
    for (const polygon of geom.coordinates) rings.push(polygon[0].map(transform));
  }
  return rings;
}

function matchPeriod(props = {}) {
  const raw = [
    props.periodId,
    props.period,
    props.phase,
    props.期次,
    props.地质期次,
    props.code,
    props.代号
  ].filter(Boolean).join(' ');
  return (
    PERIODS.find((p) => raw === p.id || raw.includes(p.code) || raw.includes(p.name) || raw.includes(p.short)) ||
    PERIODS[0]
  );
}

export function createUnitFromRing(ring, periodId, extra = {}) {
  const bounds = polygonBounds(ring);
  const centroid = polygonCentroid(ring);
  let front = ring[0];
  let frontScore = -Infinity;
  for (const p of ring) {
    const score = Math.hypot(p[0] - CONE_CENTER.x, p[1] - CONE_CENTER.y);
    if (score > frontScore) {
      frontScore = score;
      front = p;
    }
  }
  const seq = extra.seq ?? Math.floor(10000 + Math.random() * 80000);
  return {
    id: extra.id || `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    seq,
    code: extra.code || propsCode(extra.props) || `IM-${seq.toString().padStart(5, '0')}`,
    periodId,
    flowId: extra.flowId || 'imported-flow',
    gullyId: extra.gullyId || null,
    ring,
    bounds,
    centroid,
    front,
    areaHa: extra.areaHa || 0,
    distanceKm: Math.round(frontScore / 100) / 10,
    imported: true,
    sourceProps: extra.props
  };
}

function propsCode(props) {
  return props?.code || props?.unitCode || props?.单元编号 || props?.编号 || null;
}

export function parseGeoJsonToProjectLayers(text) {
  const parsed = JSON.parse(text);
  const features = parsed.type === 'FeatureCollection' ? parsed.features : parsed.type === 'Feature' ? [parsed] : [];
  if (!features.length) throw new Error('未在 GeoJSON 中找到 Feature');

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const f of features) {
    iterCoordinates(f.geometry, ([x, y]) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  }
  const transform = createTransform(bounds);
  const units = [];
  const zones = [];
  let cone = null;

  features.forEach((feature, featureIndex) => {
    const props = feature.properties || {};
    const layerText = `${props.layer || ''} ${props.kind || ''} ${props.type || ''} ${props.图层 || ''} ${props.类型 || ''} ${props.name || props.名称 || ''}`;
    const rings = featureRings(feature, transform);
    rings.forEach((ring, ringIndex) => {
      if (layerText.match(/cone|火山锥|锥边界/i)) {
        cone = { id: 'imported-cone', name: props.name || '导入火山锥边界', ring };
      } else if (layerText.match(/refuge|避险|安置|village|村/i) && !layerText.match(/lava|熔岩/)) {
        zones.push({
          id: `imported-zone-${featureIndex}-${ringIndex}`,
          name: props.name || props.名称 || `导入避险范围 ${zones.length + 1}`,
          villageName: props.village || props.村 || '导入区域',
          ring,
          imported: true
        });
      } else {
        const period = matchPeriod(props);
        units.push(
          createUnitFromRing(ring, period.id, {
            id: props.id ? String(props.id) : undefined,
            code: propsCode(props) || `GJ-${(units.length + 1).toString().padStart(5, '0')}`,
            props
          })
        );
      }
    });
  });

  return { units, zones, cone, featureCount: features.length };
}

export function exportProjectJson(project) {
  const json = JSON.stringify(project, (_key, value) => {
    if (value instanceof Float32Array) return { __type: 'Float32Array', data: Array.from(value) };
    return value;
  }, 2);
  downloadBlob(json, `${project.id}-r${project.revision}.volcano-project.json`, 'application/json');
}

export function buildHandoffGeoJson(project, { mapperIds = [], assessorIds = [], zones = [], viewState = null } = {}) {
  const selectedIds = new Set([...mapperIds, ...assessorIds]);
  const selectedUnits = project.units.filter((u) => selectedIds.has(u.id));
  const periodName = (id) => project.periods.find((p) => p.id === id)?.name || id;
  const features = [];

  for (const unit of selectedUnits) {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'selected-lava-unit',
        id: unit.id,
        code: unit.code,
        period: periodName(unit.periodId),
        selectedByMapper: mapperIds.includes(unit.id),
        selectedByAssessor: assessorIds.includes(unit.id),
        front: unit.front,
        distanceKm: unit.distanceKm
      },
      geometry: { type: 'Polygon', coordinates: [[...unit.ring, unit.ring[0]]] }
    });
    features.push({
      type: 'Feature',
      properties: { kind: 'unit-front', unitId: unit.id, code: unit.code },
      geometry: { type: 'Point', coordinates: unit.front }
    });
  }

  for (const zone of zones) {
    features.push({
      type: 'Feature',
      properties: { kind: 'refuge-scope', name: zone.name, villageName: zone.villageName },
      geometry: { type: 'Polygon', coordinates: [[...zone.ring, zone.ring[0]]] }
    });
  }

  return {
    type: 'FeatureCollection',
    metadata: {
      product: '火山锥区熔岩流单元会商与避险划定交接包',
      projectId: project.id,
      projectName: project.name,
      revision: project.revision,
      exportedAt: new Date().toISOString(),
      coordinateNote: project.coordinateNote,
      viewState,
      layerSchema: project.periods.map((p) => ({ periodId: p.id, period: p.name, color: p.color })),
      selection: { mapperIds, assessorIds }
    },
    features
  };
}

export function exportCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = row[h] ?? '';
          const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(',')
    )
  ].join('\n');
  downloadBlob(`﻿${csv}`, filename, 'text/csv;charset=utf-8');
}
