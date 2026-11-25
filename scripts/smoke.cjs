// 冒烟测试:驱动真实浏览器跑核心流程,收集页面错误
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5199/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1500,950'],
    defaultViewport: { width: 1500, height: 950 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });

  const step = async (name, fn) => {
    try {
      await fn();
      console.log('OK  ' + name);
    } catch (e) {
      console.log('FAIL ' + name + ' :: ' + e.message);
      errors.push('STEP ' + name + ': ' + e.message);
    }
  };

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.__board', { timeout: 10000 });

  // 1. 导入底图(页内合成一张带线条的测试图)
  await step('导入总装图', async () => {
    await page.evaluate(async () => {
      const cv = document.createElement('canvas');
      cv.width = 1200; cv.height = 800;
      const c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, 1200, 800);
      c.strokeStyle = '#333'; c.lineWidth = 2;
      c.strokeRect(100, 100, 1000, 600);
      c.beginPath(); c.arc(600, 400, 150, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(200, 400); c.lineTo(1000, 400); c.stroke();
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      const f = new File([blob], 'asm.png', { type: 'image/png' });
      await window.__board.importImage(f, 'main');
    });
  });

  // 2. 标定
  await step('标定转轮直径+安装高程', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      b.setCalibInputs({ runnerD: 5, datumElev: 520 });
      b._calibRunnerClick({ x: 100, y: 100 });
      b._calibRunnerClick({ x: 300, y: 100 });
      b._calibElevClick({ x: 150, y: 300 });
      return { pxPerMeter: b.calib.pxPerMeter, datumY: b.calib.datumY };
    });
    if (Math.abs(r.pxPerMeter - 40) > 0.01) throw new Error('pxPerMeter=' + r.pxPerMeter);
    if (r.datumY !== 0) throw new Error('datumY 未归零: ' + r.datumY);
  });

  // 3. 剖切线 + 剖切视图
  await step('画剖切线并生成剖切视图', async () => {
    await page.evaluate(() => {
      const b = window.__board;
      b._sectionStart({ x: -200, y: -100 });
      b._secP2 = { x: 200, y: -100 };
      b._sectionFinish();
      b.generateSection();
    });
    const ok = await page.evaluate(() => !!window.__board.sectionImg && window.__board.grips.length === 2);
    if (!ok) throw new Error('剖切视图未生成');
  });

  // 4. 拖动剖切线端点 → 视图更新
  await step('拖动剖切端点更新视图', async () => {
    await page.evaluate(() => {
      const b = window.__board;
      const g = b.grips[0];
      g.set({ left: -250, top: -150 });
      b._onGripDrag(g, true);
    });
  });

  // 5. 贴编号标注 + 高程定位
  await step('贴编号标注(按高程定位)', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      b.placeTag({ id: 'e1', code: 'SJ-01', name: '蜗壳', elev: 518.6 });
      b.placeTag({ id: 'e2', code: 'SJ-04', name: '转轮', elev: 520.0 });
      const tags = b.canvas.getObjects().filter((o) => o.data?.layer === 'tag');
      return { n: tags.length, y0: tags[0].top, y1: tags[1].top, bound: !!tags[0].data.boundTo };
    });
    if (r.n !== 2) throw new Error('标签数=' + r.n);
    // 518.6 比 520 低 1.4m → y 大 1.4*40=56
    if (Math.abs(r.y0 - r.y1 - 56) > 1) throw new Error(`高程定位偏差 y0=${r.y0} y1=${r.y1}`);
    if (!r.bound) throw new Error('标签未绑定剖切视图');
  });

  // 6. 剖切视图移动 → 标签跟随
  await step('标签随剖切视图移动', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      const tag = b.canvas.getObjects().find((o) => o.data?.layer === 'tag');
      const y0 = tag.top;
      b.sectionImg.set({ top: b.sectionImg.top + 100 });
      b.sectionImg.setCoords();
      b._followBound();
      return { dy: tag.top - y0 };
    });
    if (Math.abs(r.dy - 100) > 1) throw new Error('跟随位移=' + r.dy);
  });

  // 7. 尺寸标注 + 端点调整
  await step('画尺寸标注并调端点', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      b._dimStart({ x: -100, y: 200 });
      const d = b._dimDrawing;
      d._abs[1] = { x: 100, y: 200 };
      b._dimFinish();
      const dim = b.canvas.getObjects().find((o) => o.type === 'dim');
      if (!dim) throw new Error('尺寸对象不存在');
      const label0 = dim.label();
      // 模拟拖动端点控制柄(本地坐标)
      dim.moveEndpointLocal(1, { x: dim.rel[1].x + 10, y: dim.rel[1].y });
      dim.normalize();
      return { label0, len: dim.lengthPx() };
    });
    if (Math.abs(r.len - 200) > 15) throw new Error('尺寸长度=' + r.len);
    if (!/5\.00m/.test(r.label0)) throw new Error('尺寸文字=' + r.label0);
  });

  // 8. 撤销/重做:一次拖动一步退
  await step('撤销/重做', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      const before = b.canvas.getObjects().filter((o) => o.data?.layer === 'tag').length;
      const tag = b.canvas.getObjects().find((o) => o.data?.layer === 'tag');
      const x0 = tag.left;
      // 模拟一次拖动手势
      b._tfBefore = b._snapshot([tag]);
      tag.set({ left: x0 + 50 });
      tag.setCoords();
      b._pushTransformCmd();
      b.undo();
      const back = tag.left;
      b.redo();
      return { x0, back, again: tag.left, n: before };
    });
    if (Math.abs(r.back - r.x0) > 0.01) throw new Error('撤销未回位');
    if (Math.abs(r.again - r.x0 - 50) > 0.01) throw new Error('重做未到位');
  });

  // 9. 图层显隐/锁定
  await step('图层显隐与锁定', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      b.toggleLayer('tag', 'locked');
      const tag = b.canvas.getObjects().find((o) => o.data?.layer === 'tag');
      const lockedOk = tag.evented === false && tag.selectable === false;
      b.toggleLayer('tag', 'locked');
      b.toggleLayer('dim', 'visible');
      const dim = b.canvas.getObjects().find((o) => o.type === 'dim');
      const hiddenOk = dim.visible === false;
      b.toggleLayer('dim', 'visible');
      return { lockedOk, hiddenOk };
    });
    if (!r.lockedOk) throw new Error('锁定后仍可点中');
    if (!r.hiddenOk) throw new Error('显隐失效');
  });

  // 10. 框选整体缩放 → 字号烘焙
  await step('框选缩放烘字号', async () => {
    const r = await page.evaluate(() => {
      const b = window.__board;
      const tag = b.canvas.getObjects().find((o) => o.data?.layer === 'tag');
      const f0 = tag.fontSize;
      tag.set({ scaleX: 2, scaleY: 2 });
      b._bake(tag);
      return { f0, f1: tag.fontSize, s: tag.scaleX };
    });
    if (r.f1 !== r.f0 * 2 || r.s !== 1) throw new Error(`字号 ${r.f0}→${r.f1}, scale=${r.s}`);
  });

  // 11. 导出
  await step('导出交底图', async () => {
    await page.evaluate(() => {
      window.__board.exportPNG(
        [{ code: 'SJ-01', name: '蜗壳', elev: 518.6 }],
        '测试交底图'
      );
    });
    await new Promise((r) => setTimeout(r, 800));
  });

  // 12. 真实鼠标:框选 + 拖动(性能路径)
  await step('真实鼠标框选拖动', async () => {
    await page.evaluate(() => {
      const b = window.__board;
      b.placeAllTags([
        { id: 'a1', code: 'T1', elev: 519 }, { id: 'a2', code: 'T2', elev: 519.5 },
        { id: 'a3', code: 'T3', elev: 520 }, { id: 'a4', code: 'T4', elev: 520.5 },
      ]);
      // 把世界原点平移到屏幕 (500,400),让标签落在正坐标区
      b.canvas.viewportTransform = [1, 0, 0, 1, 500, 400];
      b.canvas.requestRenderAll();
    });
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(1100, 800, { steps: 5 });
    await page.mouse.up();
    const n = await page.evaluate(() => {
      const ao = window.__board.canvas.getActiveObject();
      return ao && ao.type === 'activeselection' ? ao.getObjects().length : 0;
    });
    if (n < 2) throw new Error('框选命中=' + n);
    await page.mouse.move(750, 450);
    await page.mouse.down();
    await page.mouse.move(850, 500, { steps: 8 });
    await page.mouse.up();
  });

  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nALL CLEAN');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
