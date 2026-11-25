import type { TemperatureRecord, TemperatureTable } from '../types';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function createSampleTable(): TemperatureTable {
  const cables = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'];
  const layerCount = 8;
  const records: TemperatureRecord[] = [];
  const start = new Date(2026, 10, 20);

  for (let day = 0; day < 5; day += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

    cables.forEach((cableId, ci) => {
      for (let layer = 1; layer <= layerCount; layer += 1) {
        const depthFactor = layer / layerCount;
        const base = 16.5 + depthFactor * 6.2 + Math.sin(ci * 0.85) * 1.1;
        const hotspot =
          (8.5 + day * 1.35) *
          Math.exp(-((ci - 5.25) ** 2 / 3.1 + (layer - 5.1) ** 2 / 2.35));
        const coolSide = -2.2 * Math.exp(-((ci - 0.8) ** 2 / 2.2 + (layer - 2.2) ** 2 / 4));
        const deterministicNoise = Math.sin((ci + 1) * 12.9898 + layer * 78.233 + day * 37.719) * 0.7;
        records.push({
          date: dateText,
          cableId,
          layer,
          temp: round1(base + hotspot + coolSide + deterministicNoise)
        });
      }
    });
  }

  return {
    records,
    dates: Array.from(new Set(records.map((r) => r.date))).sort(),
    cables,
    layerCount,
    fileName: '内置示例：8 电缆 × 8 层 × 5 天',
    skippedRows: 0
  };
}
