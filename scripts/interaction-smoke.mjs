import puppeteer from 'puppeteer-core';

const baseUrl = process.env.SMOKE_URL ?? 'http://127.0.0.1:4173/';
const executablePath =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.layer-row');

  // Make smoke the top hittable effect for this focused drag test.
  const smoke = await page.evaluate(() => {
    const studio = window.studio;
    const smokeLayer = studio.store.project.layers.find((layer) => layer.name.includes('主团扩散'));
    studio.store.project.layers
      .filter((layer) => layer.kind === 'light')
      .forEach((layer) => {
        layer.visible = false;
      });
    studio.store.select(smokeLayer.id);
    studio.store.emitChange();
    return { id: smokeLayer.id, x: smokeLayer.x, y: smokeLayer.y };
  });

  const rect = await page.evaluate((id) => {
    const controller = window.stageController;
    const node = controller.nodes.get(id).group;
    const client = node.getClientRect({ relativeTo: controller.stage });
    const host = document.querySelector('[data-stage-host]').getBoundingClientRect();
    return {
      left: host.x + client.x,
      top: host.y + client.y,
      right: host.x + client.x + client.width,
      bottom: host.y + client.y + client.height,
      centerX: host.x + client.x + client.width / 2,
      centerY: host.y + client.y + client.height / 2,
    };
  }, smoke.id);

  // Rubber-band around the complete smoke bounding box.
  await page.click('[data-tool="select"]');
  await sleep(80);
  await page.mouse.move(rect.left - 18, rect.top - 18);
  await page.mouse.down();
  await page.mouse.move(rect.right + 18, rect.bottom + 18, { steps: 8 });
  await page.mouse.up();
  await sleep(120);
  const selectedByMarquee = await page.evaluate((id) => window.studio.store.selectedIds.includes(id), smoke.id);
  if (!selectedByMarquee) throw new Error('Marquee did not select the smoke layer');

  // Drag from a lower-center point likely to hit smoke rather than a spark.
  const dragX = rect.centerX;
  const dragY = rect.top + (rect.bottom - rect.top) * 0.72;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX + 90, dragY + 45, { steps: 12 });
  await sleep(80);
  await page.mouse.up();
  await sleep(180);

  const moved = await page.evaluate((id) => {
    const store = window.studio.store;
    const layer = store.project.layers.find((item) => item.id === id);
    const group = window.stageController.nodes.get(id).group;
    return { x: layer.x, y: layer.y, groupX: group.x(), groupY: group.y() };
  }, smoke.id);

  if (Math.abs(moved.x - smoke.x) < 15 || Math.abs(moved.y - smoke.y) < 8) {
    throw new Error(`Smoke was not dragged: before=${JSON.stringify(smoke)} after=${JSON.stringify(moved)}`);
  }
  if (Math.abs(moved.x - moved.groupX) > 0.5 || Math.abs(moved.y - moved.groupY) > 0.5) {
    throw new Error(`Store and Konva group diverged after drag: ${JSON.stringify(moved)}`);
  }

  // Playback advances the playhead without runtime errors.
  await page.click('[data-action="play"]');
  await sleep(450);
  const playedTime = await page.evaluate(() => window.studio.store.currentTime);
  if (playedTime <= 0.01) throw new Error('Playback did not advance timeline');
  await page.click('[data-action="play"]');

  // Timeline clip drag must update the time point even though selection re-renders the list.
  const originalStart = await page.evaluate((id) => {
    const layer = window.studio.store.project.layers.find((item) => item.id === id);
    return layer.start;
  }, smoke.id);
  const clipHandle = await page.$(`[data-clip-id="${smoke.id}"]`);
  await clipHandle?.scrollIntoViewIfNeeded();
  const clipBox = await clipHandle?.boundingBox();
  if (!clipBox) throw new Error('Smoke timeline clip not found');
  await page.mouse.move(clipBox.x + clipBox.width / 2, clipBox.y + clipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(clipBox.x + clipBox.width / 2 + 76, clipBox.y + clipBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await sleep(160);
  const nextStart = await page.evaluate((id) => {
    const layer = window.studio.store.project.layers.find((item) => item.id === id);
    return layer.start;
  }, smoke.id);
  if (Math.abs(nextStart - originalStart - 1) > 0.08) {
    throw new Error(`Timeline clip drag did not move time by ~1s: ${originalStart} -> ${nextStart}`);
  }

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, selectedByMarquee, smoke, moved, playedTime, originalStart, nextStart }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'interaction-error.png' }).catch(() => {});
  console.error(error);
  console.error(errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
