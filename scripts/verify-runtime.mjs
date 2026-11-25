import puppeteer from 'puppeteer-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.env.VERIFY_URL || 'http://127.0.0.1:4173/';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 });
const errors = [];
const warnings = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error') errors.push(`console.error: ${text}`);
  if (message.type() === 'warning') warnings.push(text);
});
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.map-stage canvas', { timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const initial = await page.evaluate(() => ({
    title: document.title,
    stages: document.querySelectorAll('.map-stage').length,
    canvases: document.querySelectorAll('.map-stage canvas').length,
    labels: document.querySelectorAll('.map-label').length,
    stats: document.querySelector('.statusbar span')?.textContent || '',
    bodyText: document.body.innerText.slice(0, 1200)
  }));
  console.log('INITIAL', JSON.stringify(initial, null, 2));

  const listButton = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((button) => button.textContent.includes('列当前视野单元与前缘'))
  );
  const listElement = listButton.asElement();
  console.log('list button found', !!listElement);
  if (!listElement) throw new Error('visible-unit list button not found');
  await listElement.click();
  await page.waitForSelector('.unit-row', { timeout: 10000 });
  const listInfo = await page.evaluate(() => ({
    rows: document.querySelectorAll('.unit-row').length,
    metric: document.querySelector('.list-summary .metric strong')?.textContent || '',
    firstRow: document.querySelector('.unit-row strong')?.textContent || ''
  }));
  console.log('LIST', JSON.stringify(listInfo));

  await page.click('.unit-row');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const selectionTab = await page.evaluateHandle(() =>
    [...document.querySelectorAll('.right-tab')].find((button) => button.textContent.includes('选中与会商'))
  );
  await selectionTab.asElement()?.click();
  await new Promise((resolve) => setTimeout(resolve, 800));
  const selectionInfo = await page.evaluate(() => ({
    chips: document.querySelectorAll('.id-chip').length,
    activeUnit: document.querySelector('.selection-card .selection-title')?.textContent || '',
    peerCards: document.querySelectorAll('.selection-card').length,
    comparison: [...document.querySelectorAll('.metric strong')].map((node) => node.textContent).join('/')
  }));
  console.log('SELECTION', JSON.stringify(selectionInfo));

  const editInfo = await page.evaluate(async () => {
    const volcano = window.__volcano;
    const api = volcano.mapApis.mapper;
    const id = volcano.collab.peers.mapper.ids[0];
    const unit = api.unitById.get(id);
    const before = unit.ring[0][0];
    unit.ring[0] = [before + 37, unit.ring[0][1]];
    api.options.tool = 'edit';
    api.options.onCommitEdit(unit);
    await new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (!volcano.projectState.saving || Date.now() - started > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 60);
    });
    return { id, before, after: unit.ring[0][0], revision: volcano.getProject().revision };
  });
  console.log('EDIT_COMMIT', JSON.stringify(editInfo));

  await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('.map-stage canvas', { timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const persistedEdit = await page.evaluate((id) => {
    const volcano = window.__volcano;
    const unit = volcano.getProject().units.find((item) => item.id === id);
    return {
      revision: volcano.getProject().revision,
      x: unit?.ring?.[0]?.[0] ?? null,
      stages: document.querySelectorAll('.map-stage canvas').length
    };
  }, editInfo.id);
  console.log('AFTER_RELOAD', JSON.stringify(persistedEdit));
  if (persistedEdit.revision < 2 || Math.abs((persistedEdit.x || 0) - editInfo.after) > 0.01) {
    throw new Error('boundary edit was not persisted for evaluator refresh');
  }

  // Zoom the first map several times so unit labels and crisp boundary LOD engage.
  const zoomButtons = await page.$$('.map-stage:first-child .icon-btn[title="放大"]');
  for (let i = 0; i < 9; i++) {
    await zoomButtons[0].click().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const labelInfo = await page.evaluate(() => ({
    unitLabels: document.querySelectorAll('.map-label.unit').length,
    totalLabels: document.querySelectorAll('.map-label').length
  }));
  console.log('LABELS', JSON.stringify(labelInfo));

  await page.screenshot({ path: 'runtime-verification.png', fullPage: false });

  // Briefing composition exercises canvas extraction and export payload construction.
  const briefingHandle = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((button) => button.textContent.includes('会商周'))
  );
  const briefingButton = briefingHandle.asElement();
  await briefingButton?.click();
  await page.waitForSelector('.modal', { timeout: 10000 });
  await page.waitForSelector('.briefing-map[src^="data:image/png"]', { timeout: 30000 });
  const briefing = await page.evaluate(() => ({
    hasImage: !!document.querySelector('.briefing-map')?.getAttribute('src'),
    modalText: document.querySelector('.modal-header h2')?.textContent
  }));
  console.log('BRIEFING', JSON.stringify(briefing));
  await page.screenshot({ path: 'runtime-briefing.png', fullPage: false });

  if (errors.length) {
    console.error('RUNTIME ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('RUNTIME OK; warnings:', warnings.length);
    if (warnings.length) console.log(warnings.slice(0, 8).join('\n'));
  }
} catch (error) {
  console.error('VERIFICATION FAILED', error);
  try {
    await page.screenshot({ path: 'runtime-failure.png', fullPage: true });
  } catch {}
  process.exitCode = 1;
} finally {
  console.log('COLLECTED_ERRORS', errors.length);
  if (errors.length) console.error(errors.join('\n'));
  await browser.close();
}
