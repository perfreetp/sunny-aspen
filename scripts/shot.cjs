const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
    defaultViewport: { width: 1560, height: 950 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.__board');
  await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 1400; cv.height = 900;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 1400, 900);
    c.strokeStyle = '#555'; c.lineWidth = 3;
    // 画个机组剖面示意:蜗壳+座环+尾水管
    c.beginPath(); c.arc(700, 380, 180, 0, 7); c.stroke();
    c.beginPath(); c.arc(700, 380, 120, 0, 7); c.stroke();
    c.strokeRect(640, 500, 120, 260);
    c.beginPath(); c.moveTo(520, 380); c.lineTo(880, 380); c.setLineDash([6, 4]); c.stroke();
    c.setLineDash([]);
    c.font = '28px sans-serif'; c.fillStyle = '#333';
    c.fillText('厂家总装图(示意)', 80, 80);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    await window.__board.importImage(new File([blob], 'a.png'), 'main');
    const b = window.__board;
    b.setCalibInputs({ runnerD: 5, datumElev: 520 });
    b._calibRunnerClick({ x: -100, y: 0 });
    b._calibRunnerClick({ x: 100, y: 0 });
    b._calibElevClick({ x: 0, y: 60 });
    b._sectionStart({ x: -260, y: 60 });
    b._secP2 = { x: 260, y: 60 };
    b._sectionFinish();
    b.generateSection();
    b.placeAllTags([
      { id: 'e1', code: 'SJ-01', name: '蜗壳', elev: 518.6 },
      { id: 'e2', code: 'SJ-03', name: '顶盖', elev: 521.4 },
      { id: 'e3', code: 'SJ-04', name: '转轮', elev: 520.0 },
      { id: 'e4', code: 'SJ-07', name: '尾水管', elev: 515.3 },
    ]);
    b._dimStart({ x: -200, y: 200 });
    b._dimDrawing._abs[1] = { x: 200, y: 200 };
    b._dimFinish();
    b.canvas.viewportTransform = [1.1, 0, 0, 1.1, 500, 330];
    b.canvas.requestRenderAll();
    b.hooks.onZoom?.(1.1);
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/screenshot.png' });
  await browser.close();
  console.log('saved');
})();
