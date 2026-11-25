import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:4173/';
const chromePath =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const csv = [
  '日期,电缆编号,层号,温度',
  '2026-11-01,T01,1,18.0',
  '2026-11-01,T01,2,19.5',
  '2026-11-01,T01,3,22.0',
  '2026-11-01,T01,4,24.0',
  '2026-11-01,T02,1,19.0',
  '2026-11-01,T02,2,21.5',
  '2026-11-01,T02,3,28.5',
  '2026-11-01,T02,4,26.0',
  '2026-11-01,T03,1,17.0',
  '2026-11-01,T03,2,18.5',
  '2026-11-01,T03,3,20.0',
  '2026-11-01,T03,4,22.5',
  '2026-11-02,T02,3,31.2'
].join('\n');
writeFileSync('smoke-temperature.csv', csv, 'utf8');

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1680,1100']
});

const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1100, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
});
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(
    () => !!document.querySelector('grain-workbench')?.shadowRoot?.querySelector('.konvajs-content'),
    { timeout: 30000 }
  );

  const getRect = async () =>
    page.evaluate(() => {
      const el = document.querySelector('grain-workbench');
      const host = el.shadowRoot.querySelector('[data-role="host"]');
      const rect = host.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });

  const rect = await getRect();
  const px = (x) => rect.left + (x / 1040) * rect.width;
  const py = (y) => rect.top + (y / 680) * rect.height;
  const wb = () => document.querySelector('grain-workbench').workbench;
  await page.evaluate(() => {
    window.wb = () => document.querySelector('grain-workbench').workbench;
  });
  const snapshot = () => page.evaluate(() => window.wb().getSnapshot());

  console.log('initial snapshot', await snapshot());
  await page.screenshot({ path: 'smoke-1-initial.png' });

  // Brush one stroke.
  await page.mouse.move(px(250), py(333));
  await page.mouse.down();
  for (let i = 0; i <= 12; i += 1) {
    await page.mouse.move(px(250 + i * 24), py(333 + Math.sin(i / 2) * 4));
  }
  await page.mouse.up();
  let s = await snapshot();
  if (!s.canUndo) throw new Error('Brush stroke did not create undo history');

  // Undo by stroke.
  await page.evaluate(() =>
    document.querySelector('grain-workbench').shadowRoot.querySelector('[data-action="undo-top"]').click()
  );
  s = await snapshot();
  if (s.canUndo) throw new Error('Undo did not remove the one brush stroke');

  // Hot-zone lasso.
  await page.evaluate(() => wb().setTool('hotzone'));
  const cx = 650;
  const cy = 365;
  await page.mouse.move(px(cx - 95), py(cy));
  await page.mouse.down();
  for (let i = 0; i <= 28; i += 1) {
    const a = Math.PI + (i / 28) * Math.PI * 2;
    await page.mouse.move(px(cx + Math.cos(a) * 105), py(cy + Math.sin(a) * 68));
  }
  await page.mouse.up();
  s = await snapshot();
  if (!s.hasHotZone || s.tool !== 'reshape') throw new Error('Hot zone was not created');

  // Drag the first boundary anchor and ensure the point changes.
  const beforePoint = await page.evaluate(() => {
    const p = document.querySelector('grain-workbench').workbench.hotZone.points[0];
    return { ...p };
  });
  const screenPoint = { x: px(beforePoint.x), y: py(beforePoint.y) };
  const hitInfo = await page.evaluate(({ x, y, design }) => {
    const el = document.elementFromPoint(x, y);
    const bench = window.wb();
    const intersection = bench.stage.getIntersection(design);
    return {
      tag: el?.tagName,
      className: String(el?.className ?? ''),
      intersection: intersection?.className,
      intersectionDraggable: typeof intersection?.draggable === 'function' ? intersection.draggable() : null,
      stageRect: bench.stage.container().getBoundingClientRect().toJSON(),
      contentRect: bench.stage.content.getBoundingClientRect().toJSON()
    };
  }, { x: screenPoint.x, y: screenPoint.y, design: beforePoint });
  console.log('anchor debug', { rect, beforePoint, screenPoint, hitInfo });
  await page.screenshot({ path: 'smoke-debug-hotzone.png' });
  await page.mouse.move(screenPoint.x, screenPoint.y);
  const pointerHit = await page.evaluate(() => {
    const bench = window.wb();
    const p = bench.stage.getPointerPosition();
    const node = p ? bench.stage.getIntersection(p) : null;
    return { p, className: node?.className, draggable: node?.draggable?.() };
  });
  console.log('pointer hit before down', pointerHit);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(px(beforePoint.x + i * 4), py(beforePoint.y + i * 3));
  }
  const anchorDuring = await page.evaluate(() => {
    const bench = window.wb();
    const circles = bench.hotLayer.find('Circle').map((node) => ({ x: node.x(), y: node.y(), draggable: node.draggable() }));
    return circles[0];
  });
  console.log('anchor during/up', anchorDuring);
  await page.mouse.up();
  const afterPoint = await page.evaluate(() => {
    const p = document.querySelector('grain-workbench').workbench.hotZone.points[0];
    return { ...p };
  });
  if (Math.hypot(afterPoint.x - beforePoint.x, afterPoint.y - beforePoint.y) < 8) {
    throw new Error(`Boundary anchor did not move: ${JSON.stringify(beforePoint)} -> ${JSON.stringify(afterPoint)}`);
  }

  // Gradient line.
  await page.evaluate(() => wb().setTool('gradient'));
  await page.mouse.move(px(235), py(175));
  await page.mouse.down();
  for (let i = 0; i <= 12; i += 1) await page.mouse.move(px(235 + i * 1.5), py(175 + i * 31));
  await page.mouse.up();
  s = await snapshot();
  if (!s.hasGradient) throw new Error('Gradient mutation layer was not detected');
  await page.screenshot({ path: 'smoke-gradient.png' });

  // Layer view and independent layer fields.
  await page.evaluate(() => {
    const bench = wb();
    bench.setTool('brush');
    bench.setView('layer');
    bench.setSelectedLayer(3);
    bench.setTempIndex(0);
  });
  const beforeLayer4 = await page.evaluate(() => Array.from(wb().fields.get(4).temp));
  await page.mouse.move(px(250), py(320));
  await page.mouse.down();
  for (let i = 0; i <= 10; i += 1) await page.mouse.move(px(250 + i * 35), py(320));
  await page.mouse.up();
  const independence = await page.evaluate((beforeLayer4) => {
    const bench = wb();
    const l3 = bench.fields.get(3);
    const l4 = bench.fields.get(4);
    const layer4Unchanged = Array.from(l4.temp).every((value, i) =>
      Number.isNaN(value) && Number.isNaN(beforeLayer4[i]) ? true : value === beforeLayer4[i]
    );
    return {
      history: bench.history.length,
      layer4Unchanged,
      l3Cover: Array.from(l3.cover).reduce((a, b) => a + b, 0),
      l4Cover: Array.from(l4.cover).reduce((a, b) => a + b, 0),
      sameTempArray: l3.temp === l4.temp
    };
  }, beforeLayer4);
  if (independence.sameTempArray || !independence.layer4Unchanged || independence.history !== 1) {
    throw new Error(`Layer fields leaked across layers: ${JSON.stringify(independence)}`);
  }
  await page.evaluate(() => wb().setSelectedLayer(4));
  s = await snapshot();
  if (s.selectedLayer !== 4 || s.view !== 'layer') throw new Error('Layer switch failed');

  // Layer visibility isolation.
  await page.evaluate(() => wb().setLayerVisible('cloud', false));
  const visibility = await page.evaluate(() => {
    const bench = wb();
    return {
      cloud: bench.cloudLayer.visible(),
      heat: bench.heatLayer.visible(),
      hot: bench.hotLayer.visible()
    };
  });
  if (visibility.cloud || !visibility.heat || !visibility.hot) {
    throw new Error(`Layer toggle leaked: ${JSON.stringify(visibility)}`);
  }
  await page.evaluate(() => wb().setLayerVisible('cloud', true));

  await page.screenshot({ path: 'smoke-2-layer.png' });

  // CSV import through the shadow-DOM file input.
  const input = await page.waitForSelector('pierce/[data-role="file"]', { timeout: 5000 });
  await input.uploadFile('D:\\ccfb\\runs\\1000341\\workspace\\smoke-temperature.csv');
  await page.waitForFunction(
    () => document.querySelector('grain-workbench').workbench.getSnapshot().cableCount === 3,
    { timeout: 10000 }
  );
  s = await snapshot();
  if (s.layerCount !== 4 || s.recordCount !== 13) throw new Error(`CSV import mapping failed: ${JSON.stringify(s)}`);

  // Export composition path, intercepting anchor click.
  const download = await page.evaluate(async () => {
    window.__download = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedClick() {
      window.__download = { download: this.download, hasHref: String(this.href).startsWith('blob:') };
    };
    try {
      await document.querySelector('grain-workbench').workbench.exportBaseMap();
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
    return window.__download;
  });
  if (!download?.download || !download.hasHref) throw new Error(`Export did not create PNG download: ${JSON.stringify(download)}`);

  await page.evaluate(() => wb().setView('profile'));
  await page.screenshot({ path: 'smoke-3-final.png' });
  console.log('SMOKE OK', JSON.stringify({ download, errors }, null, 2));
} finally {
  if (errors.length) {
    console.error('BROWSER ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  await browser.close();
}
