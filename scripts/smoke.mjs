import puppeteer from 'puppeteer-core';

const baseUrl = process.env.SMOKE_URL ?? 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('effect-studio .stage-container canvas', { timeout: 15000 });
  await page.waitForSelector('.layer-row', { timeout: 15000 });
  const layerCount = await page.$$eval('.layer-row', (rows) => rows.length);
  if (layerCount < 10) throw new Error(`Expected at least 10 layer rows, got ${layerCount}`);
  await sleep(300);
  await page.screenshot({ path: 'smoke-initial.png' });

  // Brush one stroke on the default selected high-frequency flicker layer.
  await page.click('[data-tool="mask"]');
  await sleep(150);
  const stageRect = await page.$eval('[data-stage-host]', (el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const startX = stageRect.x + stageRect.width * 0.48;
  const startY = stageRect.y + stageRect.height * 0.36;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(startX + i * 18, startY + Math.sin(i / 2) * 16, { steps: 1 });
    await sleep(8);
  }
  await page.mouse.up();
  await page.waitForSelector('.mask-indicator', { timeout: 5000 });
  await page.screenshot({ path: 'smoke-brush.png' });

  // Undo must remove the whole committed stroke.
  await page.keyboard.down('Control');
  await page.keyboard.press('z');
  await page.keyboard.up('Control');
  await sleep(250);
  const indicatorCount = await page.$$eval('.mask-indicator', (nodes) => nodes.length);
  if (indicatorCount !== 0) throw new Error(`Expected stroke undo to remove indicator, got ${indicatorCount}`);

  // Director changes to the side photo; order/opacity UI must still render.
  await page.click('[data-bg="side"]');
  await page.waitForFunction(
    () => document.body.innerText.includes('侧面现场照片'),
    { timeout: 5000 },
  );
  const opacityValues = await page.$$eval('input[data-opacity]', (inputs) => inputs.length);
  if (opacityValues < 10) throw new Error(`Opacity sliders missing after backdrop switch: ${opacityValues}`);

  await page.screenshot({ path: 'smoke-main.png' });

  // Export sheet renders all layers and cues.
  await page.click('[data-action="export"]');
  await page.waitForSelector('.dialog-backdrop:not([hidden]) .sheet-table', { timeout: 5000 });
  const tableRows = await page.$$eval('.sheet-table tbody tr', (rows) => rows.length);
  if (tableRows < 20) throw new Error(`Export sheet rows unexpectedly low: ${tableRows}`);
  await page.screenshot({ path: 'smoke-export.png' });

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, layerCount, tableRows, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'smoke-error.png' }).catch(() => {});
  console.error(error);
  console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
