import type { TemperatureRecord, TemperatureTable } from '../types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const source = text.replace(/^﻿/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\()（）℃°]/g, '');
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return trimmed || '未标注日期';
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

const DATE_KEYS = ['日期', '观测日期', '测量日期', '检测日期', '导入日期', 'date', 'time', 'timestamp', 'day'];
const CABLE_KEYS = [
  '电缆编号',
  '电缆号',
  '电缆编码',
  '电缆',
  '测温电缆编号',
  '测温电缆',
  'cableid',
  'cablecode',
  'cable',
  'id'
];
const LAYER_KEYS = ['层号', '层编号', '测点层号', '测点层', '粮层', '层', 'layerno', 'layerid', 'layer', 'level'];
const TEMP_KEYS = [
  '温度',
  '温度值',
  '测点温度',
  '测温值',
  '温度℃',
  'temp',
  'temperature',
  'temperature℃',
  'value'
];

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of normalizedAliases) {
    const exact = normalizedHeaders.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (normalizedAliases.some((alias) => normalizedHeaders[i].includes(alias))) return i;
  }
  return -1;
}

export function parseTemperatureCsv(text: string, fileName?: string): TemperatureTable {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error('CSV 至少需要表头和一行测点数据。');
  }

  const headers = rows[0].map((h) => h.trim());
  const dateCol = findColumn(headers, DATE_KEYS);
  const cableCol = findColumn(headers, CABLE_KEYS);
  const layerCol = findColumn(headers, LAYER_KEYS);
  const tempCol = findColumn(headers, TEMP_KEYS);

  if (cableCol < 0 || layerCol < 0 || tempCol < 0) {
    throw new Error('未识别到必需列：电缆编号、层号、温度。可先下载 CSV 模板对照。');
  }

  const records: TemperatureRecord[] = [];
  let skippedRows = 0;

  for (const cells of rows.slice(1)) {
    const cableId = (cells[cableCol] ?? '').trim();
    const layerRaw = (cells[layerCol] ?? '').trim();
    const tempRaw = (cells[tempCol] ?? '').replace(/[℃°C\s]/gi, '');
    const layer = Number(layerRaw);
    const temp = Number(tempRaw);

    if (!cableId || !Number.isFinite(layer) || !Number.isFinite(temp)) {
      skippedRows += 1;
      continue;
    }

    records.push({
      date: dateCol >= 0 ? normalizeDate(cells[dateCol] ?? '') : '逐日数据',
      cableId,
      layer: Math.max(1, Math.round(layer)),
      temp
    });
  }

  if (!records.length) {
    throw new Error('没有解析到有效温度行，请检查温度和层号是否为数字。');
  }

  const dates = Array.from(new Set(records.map((r) => r.date))).sort();
  const cables = Array.from(new Set(records.map((r) => r.cableId))).sort(naturalCompare);
  const layerCount = Math.max(...records.map((r) => r.layer));

  return { records, dates, cables, layerCount, fileName, skippedRows };
}

export function createCsvTemplate(): string {
  return [
    '日期,电缆编号,层号,温度',
    '2026-11-26,C01,1,18.2',
    '2026-11-26,C01,2,19.1',
    '2026-11-26,C06,5,33.8',
    '2026-11-26,C08,8,21.4'
  ].join('\n');
}
