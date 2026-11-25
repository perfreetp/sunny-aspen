export interface TempBand {
  label: string;
  rangeLabel: string;
  min: number;
  max: number;
  color: string;
  brushTemp: number;
}

export const TEMP_BANDS: TempBand[] = [
  { label: '≤10℃', rangeLabel: '≤10', min: -Infinity, max: 10, color: '#313695', brushTemp: 7.5 },
  { label: '10–15℃', rangeLabel: '10~15', min: 10, max: 15, color: '#4575b4', brushTemp: 12.5 },
  { label: '15–20℃', rangeLabel: '15~20', min: 15, max: 20, color: '#74add1', brushTemp: 17.5 },
  { label: '20–25℃', rangeLabel: '20~25', min: 20, max: 25, color: '#66bd63', brushTemp: 22.5 },
  { label: '25–30℃', rangeLabel: '25~30', min: 25, max: 30, color: '#fee08b', brushTemp: 27.5 },
  { label: '30–35℃', rangeLabel: '30~35', min: 30, max: 35, color: '#f46d43', brushTemp: 32.5 },
  { label: '35–40℃', rangeLabel: '35~40', min: 35, max: 40, color: '#d73027', brushTemp: 37.5 },
  { label: '>40℃', rangeLabel: '>40', min: 40, max: Infinity, color: '#a50026', brushTemp: 42.5 }
];

export function tempBandIndex(temp: number): number {
  for (let i = 0; i < TEMP_BANDS.length; i += 1) {
    const band = TEMP_BANDS[i];
    if (temp >= band.min && temp < band.max) return i;
  }
  return TEMP_BANDS.length - 1;
}

export function tempColor(temp: number): string {
  return TEMP_BANDS[tempBandIndex(temp)].color;
}

export function formatTemp(temp: number | null | undefined, digits = 1): string {
  if (temp === null || temp === undefined || Number.isNaN(temp)) return '--';
  return `${temp.toFixed(digits)}℃`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
