import { CONE_CENTER, WORLD } from './sampleProject.js';

function hashNoise(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashNoise(xi, yi);
  const b = hashNoise(xi + 1, yi);
  const c = hashNoise(xi, yi + 1);
  const d = hashNoise(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let i = 0; i < 5; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency);
    frequency *= 2.05;
    amplitude *= 0.5;
  }
  return value;
}

export function createTerrainCanvas() {
  const scale = 0.5;
  const width = Math.round(WORLD.width * scale);
  const height = Math.round(WORLD.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.createImageData(width, height);
  const elev = new Float32Array(width * height);
  const cx = CONE_CENTER.x * scale;
  const cy = CONE_CENTER.y * scale;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wx = x / scale;
      const wy = y / scale;
      const dx = (wx - CONE_CENTER.x) / 360;
      const dy = (wy - CONE_CENTER.y) / 310;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const cone = 560 * Math.exp(-radial * radial * 1.35);
      const crater = 190 * Math.exp(-radial * radial * 13);
      const ridgeNoise = (fbm(x / 95, y / 95) - 0.48) * 95;
      const detail = (fbm(x / 24, y / 24) - 0.5) * 24;
      const foothills = 55 * Math.exp(-radial * 0.75);
      elev[y * width + x] = 120 + cone - crater + foothills + ridgeNoise + detail;
    }
  }

  const lightAzimuth = Math.PI * 0.78;
  const lightAltitude = Math.PI * 0.28;
  const zFactor = 0.018;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xl = elev[y * width + Math.max(0, x - 1)];
      const xr = elev[y * width + Math.min(width - 1, x + 1)];
      const yu = elev[Math.max(0, y - 1) * width + x];
      const yd = elev[Math.min(height - 1, y + 1) * width + x];
      const dzdx = (xr - xl) * zFactor;
      const dzdy = (yd - yu) * zFactor;
      const slope = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      const aspect = Math.atan2(dzdy, -dzdx);
      const hill =
        Math.cos(lightAltitude) +
        Math.sin(lightAltitude) * slope * Math.cos(lightAzimuth - aspect);
      const shade = Math.max(0.58, Math.min(1.22, 0.78 + hill * 0.34));
      const e = elev[y * width + x];

      // Lowland vegetation -> volcanic brown -> exposed summit rock.
      let r = 218;
      let g = 229;
      let b = 214;
      if (e > 185) {
        const t = Math.min(1, (e - 185) / 260);
        r = Math.round(214 - t * 58);
        g = Math.round(221 - t * 67);
        b = Math.round(205 - t * 66);
      }
      if (e > 360) {
        const t = Math.min(1, (e - 360) / 260);
        r = Math.round(156 - t * 42);
        g = Math.round(154 - t * 45);
        b = Math.round(139 - t * 42);
      }
      if (e > 560) {
        const t = Math.min(1, (e - 560) / 180);
        r = Math.round(114 - t * 28);
        g = Math.round(109 - t * 26);
        b = Math.round(103 - t * 22);
      }
      const i = (y * width + x) * 4;
      image.data[i] = Math.max(0, Math.min(255, r * shade));
      image.data[i + 1] = Math.max(0, Math.min(255, g * shade));
      image.data[i + 2] = Math.max(0, Math.min(255, b * shade));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Subtle survey grid baked only as terrain decoration.
  ctx.save();
  ctx.strokeStyle = 'rgba(74, 96, 88, 0.13)';
  ctx.lineWidth = 1;
  for (let wx = 0; wx <= WORLD.width; wx += 200) {
    ctx.beginPath();
    ctx.moveTo(wx * scale, 0);
    ctx.lineTo(wx * scale, height);
    ctx.stroke();
  }
  for (let wy = 0; wy <= WORLD.height; wy += 200) {
    ctx.beginPath();
    ctx.moveTo(0, wy * scale);
    ctx.lineTo(width, wy * scale);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}
