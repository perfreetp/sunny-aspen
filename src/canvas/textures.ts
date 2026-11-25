import type { Layer } from '../types';
import { clamp } from '../lib/format';

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  const number = Number.parseInt(value, 16);
  if (Number.isNaN(number) || value.length !== 6) return [255, 255, 255];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  teeth: number,
  rotation: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.fillStyle = '#2b333c';
  ctx.strokeStyle = '#697582';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i += 1) {
    const angle = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius * 1.16 : radius * 0.92;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = '#151a20';
  ctx.fill();
  ctx.strokeStyle = '#8794a1';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#9aa7b4';
  ctx.fill();
  ctx.restore();
}

function paintStageShell(ctx: CanvasRenderingContext2D, w: number, h: number, side: boolean): void {
  const wall = ctx.createLinearGradient(0, 0, 0, h * 0.78);
  wall.addColorStop(0, '#202833');
  wall.addColorStop(0.55, '#141a22');
  wall.addColorStop(1, '#090d13');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);

  // Acoustic wall panels.
  ctx.strokeStyle = 'rgba(148, 174, 199, 0.10)';
  ctx.lineWidth = 3;
  for (let x = 120; x < w; x += 180) {
    ctx.beginPath();
    ctx.moveTo(x, 90);
    ctx.lineTo(x + (side ? 70 : 0), 760);
    ctx.stroke();
  }
  for (let y = 150; y < 720; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (side ? -35 : 0));
    ctx.stroke();
  }

  // Floor.
  const floor = ctx.createLinearGradient(0, 740, 0, h);
  floor.addColorStop(0, '#2a211c');
  floor.addColorStop(0.5, '#171310');
  floor.addColorStop(1, '#080706');
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.moveTo(0, 760);
  ctx.lineTo(w, 735);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 210, 150, 0.12)';
  ctx.lineWidth = 3;
  for (let i = -6; i <= 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 70, 750);
    ctx.lineTo(w / 2 + i * 230, h);
    ctx.stroke();
  }

  // Truss and lamps.
  ctx.strokeStyle = '#3d4854';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(0, 92);
  ctx.lineTo(w, 72);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let x = 80; x < w; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 88);
    ctx.lineTo(x + 55, 38);
    ctx.moveTo(x + 55, 84);
    ctx.lineTo(x, 42);
    ctx.stroke();
  }
  for (const x of [260, 620, 1300, 1660]) {
    ctx.fillStyle = '#111820';
    roundedRect(ctx, x - 34, 78, 68, 58, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 150, 0.35)';
    ctx.beginPath();
    ctx.arc(x, 132, 16, 0, Math.PI * 2);
    ctx.fill();

    const beam = ctx.createLinearGradient(x, 145, x, 760);
    beam.addColorStop(0, 'rgba(255, 224, 166, 0.16)');
    beam.addColorStop(1, 'rgba(255, 224, 166, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 18, 145);
    ctx.lineTo(x + 18, 145);
    ctx.lineTo(x + 190, 760);
    ctx.lineTo(x - 190, 760);
    ctx.closePath();
    ctx.fill();
  }
}

function paintFrontMechanism(ctx: CanvasRenderingContext2D): void {
  // Ground shadow.
  const shadow = ctx.createRadialGradient(960, 815, 40, 960, 815, 430);
  shadow.addColorStop(0, 'rgba(0,0,0,.72)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(960, 820, 430, 82, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plinth.
  const plinth = ctx.createLinearGradient(640, 748, 640, 835);
  plinth.addColorStop(0, '#45515e');
  plinth.addColorStop(0.5, '#252d36');
  plinth.addColorStop(1, '#11171e');
  ctx.fillStyle = plinth;
  roundedRect(ctx, 650, 748, 620, 88, 14);
  ctx.fill();
  ctx.strokeStyle = '#718090';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Main machine housing.
  const body = ctx.createLinearGradient(720, 455, 1210, 760);
  body.addColorStop(0, '#566270');
  body.addColorStop(0.42, '#2f3944');
  body.addColorStop(1, '#171e26');
  ctx.fillStyle = body;
  roundedRect(ctx, 720, 455, 490, 310, 30);
  ctx.fill();
  ctx.strokeStyle = '#8290a0';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Recessed panel.
  const panel = ctx.createLinearGradient(770, 510, 1160, 710);
  panel.addColorStop(0, '#202832');
  panel.addColorStop(1, '#0d1218');
  ctx.fillStyle = panel;
  roundedRect(ctx, 770, 510, 390, 205, 18);
  ctx.fill();
  ctx.strokeStyle = '#465361';
  ctx.lineWidth = 4;
  ctx.stroke();

  drawGear(ctx, 865, 612, 67, 14, 0.18);
  drawGear(ctx, 1055, 625, 52, 12, -0.32);

  // Rivets.
  ctx.fillStyle = '#a9b5c1';
  for (const [x, y] of [[752, 488], [1178, 488], [752, 735], [1178, 735]]) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Trigger socket and lever; trigger point aligns with default spark origin.
  ctx.fillStyle = '#10151b';
  ctx.strokeStyle = '#9aa8b6';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(1115, 500, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffbf69';
  ctx.beginPath();
  ctx.arc(1115, 500, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#aab6c2';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1142, 486);
  ctx.lineTo(1248, 405);
  ctx.stroke();
  ctx.strokeStyle = '#d62828';
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(1248, 405);
  ctx.lineTo(1302, 365);
  ctx.stroke();

  // Hazard stripe.
  ctx.save();
  roundedRect(ctx, 805, 724, 318, 24, 6);
  ctx.clip();
  for (let x = 790; x < 1140; x += 34) {
    ctx.fillStyle = x % 68 === 0 ? '#d9a441' : '#1c2229';
    ctx.beginPath();
    ctx.moveTo(x, 750);
    ctx.lineTo(x + 18, 724);
    ctx.lineTo(x + 34, 724);
    ctx.lineTo(x + 16, 750);
    ctx.fill();
  }
  ctx.restore();
}

function paintSideMechanism(ctx: CanvasRenderingContext2D): void {
  const shadow = ctx.createRadialGradient(980, 820, 40, 980, 820, 450);
  shadow.addColorStop(0, 'rgba(0,0,0,.75)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(980, 825, 450, 80, 0, 0, Math.PI * 2);
  ctx.fill();

  // Long side plinth.
  const plinth = ctx.createLinearGradient(610, 760, 610, 850);
  plinth.addColorStop(0, '#46525f');
  plinth.addColorStop(1, '#11171e');
  ctx.fillStyle = plinth;
  roundedRect(ctx, 610, 760, 720, 82, 16);
  ctx.fill();
  ctx.strokeStyle = '#718090';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Side profile body.
  const body = ctx.createLinearGradient(700, 470, 1240, 770);
  body.addColorStop(0, '#596574');
  body.addColorStop(0.48, '#303a45');
  body.addColorStop(1, '#151c24');
  ctx.fillStyle = body;
  roundedRect(ctx, 700, 485, 540, 285, 24);
  ctx.fill();
  ctx.strokeStyle = '#8290a0';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Side ribs.
  ctx.strokeStyle = 'rgba(180, 198, 216, .22)';
  ctx.lineWidth = 8;
  for (let x = 750; x <= 1180; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 515);
    ctx.lineTo(x - 18, 748);
    ctx.stroke();
  }

  // Large flywheel.
  drawGear(ctx, 965, 635, 128, 18, 0.08);
  ctx.fillStyle = '#111820';
  ctx.beginPath();
  ctx.arc(965, 635, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#93a1af';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Side lever and trigger point, shifted relative to front view.
  ctx.fillStyle = '#10151b';
  ctx.strokeStyle = '#9aa8b6';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(1215, 515, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffbf69';
  ctx.beginPath();
  ctx.arc(1215, 515, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#b7c2cd';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1238, 498);
  ctx.lineTo(1328, 405);
  ctx.stroke();
  ctx.strokeStyle = '#d62828';
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(1328, 405);
  ctx.lineTo(1378, 350);
  ctx.stroke();
}

function finishPhoto(ctx: CanvasRenderingContext2D, w: number, h: number, label: string): void {
  // Camera grain.
  const random = seededRandom(424242);
  for (let i = 0; i < 5200; i += 1) {
    const alpha = random() * 0.055;
    ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random() * 2);
  }

  const vignette = ctx.createRadialGradient(w / 2, h * 0.52, h * 0.25, w / 2, h * 0.52, w * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.58)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(5, 9, 14, .62)';
  roundedRect(ctx, 34, 30, 360, 58, 12);
  ctx.fill();
  ctx.fillStyle = '#dce8f5';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.fillText(label, 56, 69);

  ctx.strokeStyle = 'rgba(255, 80, 80, .75)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w - 105, 62, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 80, 80, .9)';
  ctx.beginPath();
  ctx.arc(w - 105, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dce8f5';
  ctx.font = '700 24px ui-monospace, monospace';
  ctx.fillText('TRIGGER CAM', w - 270, 71);
}

export function paintBackdrop(canvas: HTMLCanvasElement, side: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  paintStageShell(ctx, w, h, side);
  if (side) paintSideMechanism(ctx);
  else paintFrontMechanism(ctx);
  finishPhoto(ctx, w, h, side ? '示例侧面照片 SIDE' : '示例正面照片 FRONT');
}

export function flickerValue(layer: Layer, time: number): number {
  const { frequency, intensity, seed } = layer.effect;
  const t = Math.max(0, time);
  const slot = Math.floor(t * frequency);
  const random = hash01(seed + slot * 17.13);
  const dropout = hash01(seed * 0.013 + Math.floor(t * 2.7)) > 0.72;
  let value = dropout ? 0.04 + random * 0.16 : 0.52 + random * 0.48;
  value *= 0.86 + 0.14 * Math.sin(t * frequency * 2.31 + seed);
  // A deliberately strong middle burst gives designers something to tone down.
  const brightPatch = Math.exp(-((t - 1.45) ** 2) / 0.16) * 0.28;
  return clamp((value + brightPatch) * intensity, 0, 1.25);
}

function paintLight(ctx: CanvasRenderingContext2D, layer: Layer, time: number): void {
  const w = layer.width;
  const h = layer.height;
  const e = layer.effect;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const centers =
    e.variant === 2
      ? [[w * 0.5, h * 0.42, 0.52]]
      : e.variant === 1
        ? [[w * 0.28, h * 0.28, 0.42], [w * 0.72, h * 0.25, 0.48], [w * 0.52, h * 0.48, 0.62]]
        : [[w * 0.52, h * 0.42, 0.62], [w * 0.36, h * 0.5, 0.36]];

  for (const [cx, cy, radiusRatio] of centers) {
    const radius = Math.max(w, h) * radiusRatio;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, rgba(e.color, 0.72));
    gradient.addColorStop(0.18, rgba(e.color, 0.34));
    gradient.addColorStop(0.55, rgba(e.color2 ?? e.color, 0.12));
    gradient.addColorStop(1, rgba(e.color2 ?? e.color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // Soft beams.
  ctx.globalAlpha = 0.22 + 0.08 * Math.sin(time * 18);
  const beam = ctx.createLinearGradient(0, 0, 0, h);
  beam.addColorStop(0, rgba(e.color, 0.55));
  beam.addColorStop(1, rgba(e.color, 0));
  ctx.fillStyle = beam;
  for (let i = 0; i < (e.variant === 1 ? 5 : 3); i += 1) {
    const x = w * (0.18 + i * 0.31);
    ctx.beginPath();
    ctx.moveTo(x - 18, 0);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x + w * 0.22, h);
    ctx.lineTo(x - w * 0.16, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

interface Puff {
  x: number;
  y: number;
  r: number;
  drift: number;
  rise: number;
  phase: number;
  alpha: number;
}

function smokePuffs(layer: Layer): Puff[] {
  const random = seededRandom(layer.effect.seed);
  const count = Math.round(20 * layer.effect.density);
  return Array.from({ length: count }, () => ({
    x: 0.5 + (random() - 0.5) * 0.58,
    y: 0.58 + (random() - 0.5) * 0.34,
    r: 0.12 + random() * 0.2,
    drift: (random() - 0.5) * 0.12,
    rise: 0.08 + random() * 0.16,
    phase: random() * Math.PI * 2,
    alpha: 0.1 + random() * 0.16,
  }));
}

function paintSmoke(ctx: CanvasRenderingContext2D, layer: Layer, time: number): void {
  const w = layer.width;
  const h = layer.height;
  const e = layer.effect;
  ctx.clearRect(0, 0, w, h);
  const puffs = smokePuffs(layer);
  const grow = clamp(time / Math.min(2.8, Math.max(1.2, layer.duration * 0.45)), 0, 1);
  const endFade = layer.duration > 0 ? clamp((layer.duration - time) / 1.1, 0, 1) : 1;
  const beginFade = clamp(time / 0.45, 0, 1);
  const lifeAlpha = beginFade * (0.35 + 0.65 * endFade);

  for (const puff of puffs) {
    const sway = Math.sin(time * e.speed * 0.7 + puff.phase) * 0.025;
    const x = w * (puff.x + sway + puff.drift * time * 0.035 * e.drift);
    const y = h * (puff.y - puff.rise * time * 0.055 * e.drift);
    const radius = Math.max(8, w * puff.r * (0.62 + grow * 0.72 * e.spread) * (1 + time * 0.018));
    const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, rgba(e.color, puff.alpha * lifeAlpha));
    gradient.addColorStop(0.58, rgba(e.color2 ?? '#66717b', puff.alpha * 0.72 * lifeAlpha));
    gradient.addColorStop(1, rgba(e.color2 ?? '#66717b', 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Broad low haze.
  const haze = ctx.createRadialGradient(w / 2, h * 0.72, 10, w / 2, h * 0.72, w * 0.58 * (0.75 + grow * 0.35));
  haze.addColorStop(0, rgba(e.color, 0.16 * lifeAlpha));
  haze.addColorStop(1, rgba(e.color2 ?? '#5d6872', 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}

interface Spark {
  angle: number;
  speed: number;
  life: number;
  delay: number;
  size: number;
  drift: number;
}

function sparkParticles(layer: Layer): Spark[] {
  const random = seededRandom(layer.effect.seed);
  const count = Math.round(72 * layer.effect.density);
  return Array.from({ length: count }, () => {
    const variant = layer.effect.variant;
    const angle =
      variant === 3
        ? -Math.PI / 2 + (random() - 0.5) * 0.75
        : variant === 1
          ? Math.PI * (0.15 + random() * 0.7)
          : -Math.PI * (0.08 + random() * 0.84);
    return {
      angle,
      speed: (variant === 3 ? 35 : 130) + random() * (variant === 3 ? 90 : 360),
      life: 0.65 + random() * 1.45,
      delay: random() * 0.28,
      size: 1.4 + random() * 2.8,
      drift: (random() - 0.5) * 80,
    };
  });
}

function paintSparks(ctx: CanvasRenderingContext2D, layer: Layer, time: number): void {
  const w = layer.width;
  const h = layer.height;
  const e = layer.effect;
  ctx.clearRect(0, 0, w, h);
  const particles = sparkParticles(layer);
  const ox = w * (e.variant === 1 ? 0.5 : 0.48);
  const oy = h * (e.variant === 3 ? 0.86 : 0.42);
  const gravity = e.variant === 3 ? -35 : 520;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (const p of particles) {
    const age = time - p.delay;
    if (age <= 0 || age >= p.life) continue;
    const vx = Math.cos(p.angle) * p.speed * e.speed + p.drift;
    const vy = Math.sin(p.angle) * p.speed * e.speed;
    const x = ox + vx * age;
    const y = oy + vy * age + 0.5 * gravity * age * age;
    const previousAge = Math.max(0, age - 0.045);
    const px = ox + vx * previousAge;
    const py = oy + vy * previousAge + 0.5 * gravity * previousAge * previousAge;
    const alpha = clamp(1 - age / p.life, 0, 1);

    ctx.strokeStyle = rgba(age < 0.18 ? '#ffffff' : e.color, alpha);
    ctx.lineWidth = p.size;
    ctx.shadowColor = e.color2 ?? e.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = rgba('#ffffff', alpha * 0.9);
    ctx.beginPath();
    ctx.arc(x, y, p.size * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function paintEffectFrame(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  time: number,
): void {
  if (layer.texture === 'fx-light') paintLight(ctx, layer, time);
  else if (layer.texture === 'fx-smoke') paintSmoke(ctx, layer, time);
  else if (layer.texture === 'fx-spark') paintSparks(ctx, layer, time);
}

export function createProceduralCanvas(layer: Layer): HTMLCanvasElement {
  const canvas = makeCanvas(layer.width, layer.height);
  if (layer.texture === 'bg-front') paintBackdrop(canvas, false);
  else if (layer.texture === 'bg-side') paintBackdrop(canvas, true);
  else {
    const ctx = canvas.getContext('2d');
    if (ctx) paintEffectFrame(ctx, layer, Math.min(1.15, layer.duration * 0.32));
  }
  return canvas;
}
