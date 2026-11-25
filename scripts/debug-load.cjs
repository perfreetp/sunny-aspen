const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  page.on('requestfailed', (r) => console.log('REQFAIL', r.url()));
  const resp = await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle0', timeout: 20000 }).catch(e => console.log('GOTO FAIL', e.message));
  console.log('status', resp && resp.status());
  await new Promise(r => setTimeout(r, 3000));
  console.log('__board:', await page.evaluate(() => String(!!window.__board)));
  console.log('root html len:', await page.evaluate(() => document.getElementById('root')?.innerHTML.length));
  await browser.close();
})();
