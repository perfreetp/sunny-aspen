import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const url = process.env.CHECK_URL ?? 'http://127.0.0.1:4173/';
const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = chromeCandidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome or Edge executable found');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  defaultViewport: { width: 1600, height: 1050, deviceScaleFactor: 1 },
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

const page = await browser.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));

async function setInput(testId, value) {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true });
  await page.$eval(
    selector,
    (el, nextValue) => {
      const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(el, String(nextValue));
      else el.value = String(nextValue);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value
  );
}

async function planPoint(schemeId, fn) {
  return page.evaluate(
    ({ schemeId, fnSource }) => {
      const host = document.querySelector(`[data-testid="plan-canvas-${schemeId}"]`);
      const rect = host.getBoundingClientRect();
      const planner = window.__siloPlanner;
      const scheme = planner.workspace.schemes[schemeId];
      const network = planner.buildNetwork(scheme);
      const d = network.params.innerDiameter;
      const scale = Math.min(
        (host.clientWidth - 56) / (d + 2.2),
        (host.clientHeight - 112) / (d + 1.5)
      );
      const cx = host.clientWidth / 2;
      const cy = 58 + network.silo.radius * scale + 8;
      const result = eval(fnSource)(network);
      return {
        x: rect.left + cx + result.x * scale,
        y: rect.top + cy - result.y * scale
      };
    },
    { schemeId, fnSource: fn.toString() }
  );
}

try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('[data-testid="plan-canvas-A"] canvas', { timeout: 30000 });
  await page.waitForSelector('[data-testid="section-A"] svg');
  await new Promise((resolve) => setTimeout(resolve, 900));

  const initial = await page.evaluate(() => {
    const planner = window.__siloPlanner;
    return {
      hasPlanner: Boolean(planner),
      fingerprint: planner.buildNetwork(planner.workspace.schemes.A).fingerprint,
      spacing: planner.buildNetwork(planner.workspace.schemes.A).stats.spacingX,
      activeVents: planner.buildNetwork(planner.workspace.schemes.A).stats.activeVentCount,
      title: document.querySelector('h1')?.textContent
    };
  });
  console.log('initial', initial);
  if (!initial.hasPlanner) throw new Error('planner handle missing');

  // Real Pixi pointer drag to create a manual branch override.
  const branchPoint = await planPoint('A', (network) => {
    const b = network.branches.find((item) => item.id === 'b2');
    const a = b.points[0];
    const z = b.points[1];
    // Use the exposed outer tail of the branch, beyond most vent markers.
    return { x: a.x + (z.x - a.x) * 0.92, y: a.y + (z.y - a.y) * 0.92 };
  });
  await page.mouse.move(branchPoint.x, branchPoint.y);
  await page.mouse.down();
  await page.mouse.move(branchPoint.x + 72, branchPoint.y + 8, { steps: 8 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const afterDrag = await page.evaluate(() => {
    const value = window.__siloPlanner.workspace.schemes.A.branchOverrides.b2 ?? null;
    return value ? JSON.parse(JSON.stringify(value)) : null;
  });
  console.log('branch override after drag', afterDrag);
  if (!afterDrag || !Number.isFinite(afterDrag.xM)) throw new Error('branch drag did not create xM override');

  // Delete a specific vent with canvas click + keyboard.
  const ventPoint = await planPoint('A', (network) => network.allVents.find((v) => v.id === 'v-2-3'));
  await page.mouse.click(ventPoint.x, ventPoint.y);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.keyboard.press('Delete');
  await new Promise((resolve) => setTimeout(resolve, 180));
  const afterDelete = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.__siloPlanner.workspace.schemes.A.removedVentIds))
  );
  console.log('removed after Delete key', afterDelete);
  if (!afterDelete.includes('v-2-3')) throw new Error('vent was not deleted');

  // Change diameter: manual branch override record must survive.
  const beforeDiameterX = afterDrag.xM;
  await setInput('input-diameter', '26');
  await new Promise((resolve) => setTimeout(resolve, 350));
  const afterDiameter = await page.evaluate((xM) => {
    const planner = window.__siloPlanner;
    const scheme = planner.workspace.schemes.A;
    const network = planner.buildNetwork(scheme);
    const branch = network.branches.find((b) => b.id === 'b2');
    return {
      override: scheme.branchOverrides.b2,
      drawnX: branch.points[0].x,
      spacing: network.stats.spacingX,
      branchLength: network.stats.branchLengthM,
      preserved: scheme.branchOverrides.b2?.xM === xM
    };
  }, beforeDiameterX);
  console.log('after diameter', afterDiameter);
  if (!afterDiameter.preserved) throw new Error('manual branch override was lost on diameter change');
  if (!(afterDiameter.spacing > initial.spacing)) throw new Error('spacing did not grow with diameter');

  // Change grain line: deleted vent stays deleted; other vents move.
  const beforeGrainVent = await page.evaluate(() => {
    const v = window.__siloPlanner.buildNetwork(window.__siloPlanner.workspace.schemes.A).vents.find((x) => x.id === 'v-1-1');
    return { x: v.x, y: v.y };
  });
  await setInput('input-grain-line', '18.4');
  await new Promise((resolve) => setTimeout(resolve, 350));
  const afterGrain = await page.evaluate((before) => {
    const planner = window.__siloPlanner;
    const scheme = planner.workspace.schemes.A;
    const network = planner.buildNetwork(scheme);
    const v = network.vents.find((x) => x.id === 'v-1-1');
    return {
      removed: JSON.parse(JSON.stringify(scheme.removedVentIds)),
      active: network.stats.activeVentCount,
      moved: Math.hypot(v.x - before.x, v.y - before.y) > 0.01,
      deletedAbsent: !network.vents.some((x) => x.id === 'v-2-3')
    };
  }, beforeGrainVent);
  console.log('after grain line', afterGrain);
  if (!afterGrain.removed.includes('v-2-3') || !afterGrain.deletedAbsent || afterGrain.active !== 59 || !afterGrain.moved) {
    throw new Error('grain-line deletion/reflow invariant failed');
  }

  // Seed reproducibility in the live app. Compare against current diameter/grain state.
  const seedBaseline = await page.evaluate(() => {
    const p = window.__siloPlanner.workspace.schemes.A.params;
    return {
      fingerprint: window.__siloPlanner.buildNetwork(window.__siloPlanner.workspace.schemes.A).fingerprint,
      seed: p.seed,
      d: p.innerDiameter,
      grain: p.grainLine
    };
  });
  const currentSeed = await page.$eval('[data-testid="input-seed"]', (el) => el.value);
  await setInput('input-seed', 'BROWSER-SEED-XYZ');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const changedFingerprint = await page.evaluate(() =>
    window.__siloPlanner.buildNetwork(window.__siloPlanner.workspace.schemes.A).fingerprint
  );
  await setInput('input-seed', currentSeed);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const restored = await page.evaluate(() => {
    const planner = window.__siloPlanner;
    const p = planner.workspace.schemes.A.params;
    return {
      fingerprint: planner.buildNetwork(planner.workspace.schemes.A).fingerprint,
      seed: p.seed,
      d: p.innerDiameter,
      grain: p.grainLine
    };
  });
  const restoredFingerprint = restored.fingerprint;
  console.log('seed fingerprints', { seedBaseline, currentSeed, changedFingerprint, restored });
  if (changedFingerprint === seedBaseline.fingerprint) throw new Error('seed did not change layout');
  if (restoredFingerprint !== seedBaseline.fingerprint) {
    throw new Error(`same seed did not restore exact fingerprint: ${JSON.stringify({ seedBaseline, restored, currentSeed })}`);
  }

  await page.screenshot({ path: 'browser-design-check.png', fullPage: true });

  // Compare page with two live Pixi canvases.
  await page.click('[data-testid="nav-compare"]');
  await page.waitForSelector('[data-testid="compare-page"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="plan-canvas-"] canvas').length >= 2, {
    timeout: 30000
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.screenshot({ path: 'browser-compare-check.png', fullPage: true });

  // Handoff confirmation.
  await page.click('[data-testid="nav-handoff"]');
  await page.waitForSelector('[data-testid="handoff-page"]');
  await page.waitForSelector('[data-testid="plan-canvas-A"] canvas, [data-testid="plan-canvas-B"] canvas');
  await page.type('[data-testid="handoff-note"]', 'Browser verification note.');
  await page.click('[data-testid="confirm-handoff"]');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const handedOff = await page.evaluate(() => window.__siloPlanner.workspace.schemes.A.handedOff);
  if (!handedOff) throw new Error('handoff was not confirmed');
  await page.screenshot({ path: 'browser-handoff-check.png', fullPage: true });

  if (errors.length) {
    console.warn('\nBROWSER ERRORS:\n' + errors.join('\n'));
    throw new Error(`${errors.length} browser console/page errors`);
  }

  console.log('\nBROWSER CHECK PASSED');
} catch (error) {
  await page.screenshot({ path: 'browser-failure-check.png', fullPage: true }).catch(() => {});
  if (errors.length) console.warn('\nBROWSER ERRORS AT FAILURE:\n' + errors.join('\n'));
  throw error;
} finally {
  await browser.close();
}
