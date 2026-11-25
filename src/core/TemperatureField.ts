import { TEMP_BANDS, tempBandIndex } from '../lib/temperature';

export const FIELD_NX = 220;
export const FIELD_NY = 18;

export interface FieldSnapshot {
  temp: Float32Array;
  cover: Float32Array;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

const BAND_RGB = TEMP_BANDS.map((band) => hexToRgb(band.color));

export class TemperatureField {
  readonly layer: number;
  readonly nx = FIELD_NX;
  readonly ny = FIELD_NY;
  readonly temp: Float32Array;
  readonly cover: Float32Array;
  readonly canvas: HTMLCanvasElement;
  readonly maskCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly maskCtx: CanvasRenderingContext2D;
  private maskThreshold = Number.NaN;

  constructor(layer: number) {
    this.layer = layer;
    this.temp = new Float32Array(this.nx * this.ny);
    this.cover = new Float32Array(this.nx * this.ny);
    this.temp.fill(Number.NaN);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.nx;
    this.canvas.height = this.ny;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.nx;
    this.maskCanvas.height = this.ny;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  snapshot(): FieldSnapshot {
    return { temp: new Float32Array(this.temp), cover: new Float32Array(this.cover) };
  }

  restore(snapshot: FieldSnapshot): void {
    this.temp.set(snapshot.temp);
    this.cover.set(snapshot.cover);
    this.render();
  }

  clear(): void {
    this.temp.fill(Number.NaN);
    this.cover.fill(0);
    this.render();
  }

  seedFromReadings(readings: Array<{ x: number; temp: number }>, left: number, width: number): void {
    if (!readings.length) return;
    const sorted = readings
      .map((r) => ({ u: (r.x - left) / width, temp: r.temp }))
      .sort((a, b) => a.u - b.u);

    for (let ix = 0; ix < this.nx; ix += 1) {
      const u = ix / (this.nx - 1);
      let value: number;
      if (sorted.length === 1) {
        value = sorted[0].temp;
      } else {
        let rightIndex = sorted.findIndex((p) => p.u >= u);
        if (rightIndex <= 0) {
          value = sorted[0].temp;
        } else if (rightIndex === -1) {
          value = sorted[sorted.length - 1].temp;
        } else {
          const leftPoint = sorted[rightIndex - 1];
          const rightPoint = sorted[rightIndex];
          const span = rightPoint.u - leftPoint.u || 1;
          const t = (u - leftPoint.u) / span;
          value = leftPoint.temp + (rightPoint.temp - leftPoint.temp) * t;
        }
      }

      // Readings describe the whole layer; add only a tiny deterministic texture.
      for (let iy = 0; iy < this.ny; iy += 1) {
        const index = iy * this.nx + ix;
        const texture = Math.sin(ix * 0.17 + iy * 1.91 + this.layer * 2.3) * 0.18;
        this.temp[index] = value + texture;
        const edgeFade = Math.min(1, u * 12 + 0.15, (1 - u) * 12 + 0.15);
        this.cover[index] = 0.72 * Math.max(0.25, edgeFade);
      }
    }
    this.render();
  }

  dab(centerX: number, centerY: number, radiusX: number, radiusY: number, brushTemp: number): void {
    const minX = Math.max(0, Math.floor(centerX - radiusX));
    const maxX = Math.min(this.nx - 1, Math.ceil(centerX + radiusX));
    const minY = Math.max(0, Math.floor(centerY - radiusY));
    const maxY = Math.min(this.ny - 1, Math.ceil(centerY + radiusY));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x + 0.5 - centerX) / radiusX;
        const dy = (y + 0.5 - centerY) / radiusY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 1) continue;

        const index = y * this.nx + x;
        const falloff = Math.pow(1 - distance, 1.7);
        const paintAlpha = Math.min(0.92, falloff * 0.72);
        if (Number.isNaN(this.temp[index])) this.temp[index] = brushTemp;
        else this.temp[index] = this.temp[index] * (1 - paintAlpha) + brushTemp * paintAlpha;
        this.cover[index] = Math.min(1, this.cover[index] + falloff * 0.28);
      }
    }
  }

  render(): void {
    const image = this.ctx.createImageData(this.nx, this.ny);
    for (let i = 0; i < this.temp.length; i += 1) {
      const alpha = Math.round(Math.min(1, this.cover[i]) * 222);
      if (alpha < 4 || Number.isNaN(this.temp[i])) {
        image.data[i * 4 + 3] = 0;
        continue;
      }
      const [r, g, b] = BAND_RGB[tempBandIndex(this.temp[i])];
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = alpha;
    }
    this.ctx.putImageData(image, 0, 0);
  }

  renderMask(threshold: number): HTMLCanvasElement {
    if (this.maskThreshold === threshold) return this.maskCanvas;
    this.maskThreshold = threshold;
    const image = this.maskCtx.createImageData(this.nx, this.ny);

    for (let i = 0; i < this.temp.length; i += 1) {
      const t = this.temp[i];
      if (Number.isNaN(t) || t < threshold || this.cover[i] < 0.08) {
        image.data[i * 4 + 3] = 0;
        continue;
      }
      const exceed = Math.min(1, (t - threshold) / 8);
      image.data[i * 4] = 220;
      image.data[i * 4 + 1] = Math.round(38 - exceed * 20);
      image.data[i * 4 + 2] = 20;
      image.data[i * 4 + 3] = Math.round(this.cover[i] * (90 + exceed * 145));
    }
    this.maskCtx.putImageData(image, 0, 0);
    return this.maskCanvas;
  }

  averageInBand(): { avg: number; min: number; max: number } | null {
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.temp.length; i += 1) {
      if (!Number.isNaN(this.temp[i]) && this.cover[i] > 0.1) {
        sum += this.temp[i];
        count += 1;
        min = Math.min(min, this.temp[i]);
        max = Math.max(max, this.temp[i]);
      }
    }
    return count ? { avg: sum / count, min, max } : null;
  }
}
