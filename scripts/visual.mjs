import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = process.env.SHOT_DIR ?? 'shots';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

async function pageAt(width, height, opts = {}) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5179', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  if (opts.seed) {
    await p.evaluate((sd) => {
      const raw = JSON.parse(localStorage.getItem('greenhouse-irrigation-schematic:v1') || 'null');
      return raw;
    }, opts.seed);
  }
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('canvas.canvas');
  await p.waitForTimeout(800);
  return p;
}

const shot = async (p, n) => { await p.screenshot({ path: `${outDir}/${n}.png` }); console.log('shot', n); };

// desktop default
let p = await pageAt(1600, 1000);
await shot(p, 'v-desktop');

// zoomed in, to show emitter detail
const rect = await p.locator('canvas.canvas').boundingBox();
const scene = await p.evaluate(() => window.__irrigationScene);
const b = scene.branches[3];
await p.mouse.move(rect.x + b.x1, rect.y + (b.y1 + b.y2) / 2);
await p.mouse.wheel(0, -1100);
await p.waitForTimeout(600);
// select that branch
const s2 = await p.evaluate(() => window.__irrigationScene);
const b2 = s2.branches[3];
await p.mouse.click(rect.x + b2.x1, rect.y + b2.y1 + 10);
await p.waitForTimeout(400);
await shot(p, 'v-zoomed-branch');
await p.close();

// sprinkler preset
p = await pageAt(1600, 1000);
await p.selectOption('.preset-select', 'sprinkler');
await p.waitForTimeout(800);
await p.locator('.view-toggles label', { hasText: '喷头射程' }).locator('input').check();
await p.waitForTimeout(500);
await shot(p, 'v-sprinkler');
await p.close();

// aisle conflicts
p = await pageAt(1600, 1000);
await p.selectOption('.preset-select', 'aisle');
await p.waitForTimeout(800);
await p.locator('.tab', { hasText: '穿道清单' }).click();
await p.waitForTimeout(300);
await shot(p, 'v-aisle');
await p.close();

// warnings
p = await pageAt(1600, 1000);
await p.selectOption('.preset-select', 'overdrop');
await p.waitForTimeout(800);
await p.locator('.tab', { hasText: '校核' }).click();
await p.waitForTimeout(300);
await shot(p, 'v-overdrop');
await p.close();

// tablet & phone
p = await pageAt(1024, 900);
await shot(p, 'v-tablet');
await p.close();
p = await pageAt(430, 900);
await shot(p, 'v-phone');
await p.close();

await browser.close();
