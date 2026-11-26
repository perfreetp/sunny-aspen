import { pipe } from '../core/catalogue';
import type { Solution } from '../core/types';

const quote = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rowsToCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(quote).join(',')).join('\r\n');

/**
 * Segment schedule: one row per hydraulically distinct pipe segment, the thing
 * a technician takes to the field / the installer.
 */
export function segmentsCsv(solution: Solution): string {
  const rows: (string | number)[][] = [
    [
      '管线',
      '支管编号',
      '段号',
      '起点(m)',
      '终点(m)',
      '段长(m)',
      '管径(mm)',
      '流量(L/h)',
      '流速(m/s)',
      '摩阻损失(m)',
      '段末累计损失(m)',
      '允许损失(m)',
      '状态',
      '建议',
    ],
  ];
  for (const s of solution.main.segments) {
    rows.push([
      '主管',
      '-',
      s.index + 1,
      s.from.toFixed(2),
      s.to.toFixed(2),
      s.lengthM.toFixed(2),
      pipe(s.diameterId).dn,
      s.flowLph.toFixed(0),
      s.velocity.toFixed(2),
      s.hf.toFixed(3),
      s.cumLoss.toFixed(2),
      s.budget.toFixed(2),
      s.status === 'ok' ? '正常' : s.status === 'warn' ? '压降超限' : s.status === 'velocity' ? '流速超限' : '—',
      s.advice ?? '',
    ]);
  }
  for (const br of solution.branches) {
    for (const s of br.segments) {
      rows.push([
        '支管',
        br.index + 1,
        s.index + 1,
        s.from.toFixed(2),
        s.to.toFixed(2),
        s.lengthM.toFixed(2),
        pipe(s.diameterId).dn,
        s.flowLph.toFixed(0),
        s.velocity.toFixed(2),
        s.hf.toFixed(3),
        s.cumLoss.toFixed(2),
        s.budget.toFixed(2),
        s.status === 'ok' ? '正常' : s.status === 'warn' ? '压降超限' : s.status === 'velocity' ? '流速超限' : '—',
        s.advice ?? '',
      ]);
    }
  }
  return rowsToCsv(rows);
}

export function emittersCsv(solution: Solution): string {
  const rows: (string | number)[][] = [
    ['支管编号', '序号', '类型', '距支管入口(m)', '出流(L/h)', '工作压力(kPa)'],
  ];
  for (const br of solution.branches) {
    br.emitters.forEach((e, i) => {
      rows.push([
        br.index + 1,
        i + 1,
        e.type === 'drip' ? '滴头' : '喷头',
        e.s.toFixed(3),
        e.q.toFixed(2),
        (br.emitterHeads[i] * 9.81).toFixed(1),
      ]);
    });
  }
  return rowsToCsv(rows);
}

export function conflictsCsv(solution: Solution): string {
  const rows: (string | number)[][] = [
    ['支管编号', '支管位置(m)', '作业道编号', '作业道起点(m)', '作业道终点(m)', '建议位置(m)', '长度(m)'],
  ];
  for (const c of solution.conflicts) {
    const br = solution.layout.branches.find((b) => b.index === c.branchIndex);
    rows.push([
      c.branchIndex + 1,
      (br?.u ?? 0).toFixed(2),
      c.aisleIndex + 1,
      c.aisle.u0.toFixed(2),
      c.aisle.u1.toFixed(2),
      c.suggestedU?.toFixed(2) ?? '—',
      (br?.lengthM ?? 0).toFixed(2),
    ]);
  }
  return rowsToCsv(rows);
}

export function bomCsv(solution: Solution): string {
  const rows: (string | number)[][] = [['项目', '规格', '数量', '单位']];
  const pipeRows = Object.entries(solution.totals.pipeM)
    .filter(([, m]) => m > 0.05)
    .sort((a, b) => pipe(a[0]).dn - pipe(b[0]).dn);
  for (const [id, m] of pipeRows) {
    rows.push(['PE 管', `DN${pipe(id).dn} (PN${pipe(id).pnMpa} MPa)`, m.toFixed(1), 'm']);
  }
  if (solution.totals.dripCount) {
    rows.push(['滴头', solution.layout.branches[0] ? '按灌水器参数' : '—', solution.totals.dripCount, '个']);
  }
  if (solution.totals.sprinklerCount) {
    rows.push(['喷头', '按灌水器参数', solution.totals.sprinklerCount, '个']);
  }
  rows.push(['支管', '按段统计', solution.totals.branchCount, '条']);
  rows.push(['首部', '过滤+阀门+施肥', 1, '套']);
  return rowsToCsv(rows);
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  // Excel needs a BOM to read UTF-8 Chinese CSV correctly.
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
