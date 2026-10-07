// Browser check of the calculator page. Run: node tests/page.test.js (needs playwright + chromium)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const pg = await b.newPage({ viewport: { width: 375, height: 800 } });
  const url = 'file://' + path.resolve(__dirname, '../etsy-fee-calculator.html');
  await pg.goto(url);
  const res = [];
  const ok = (n, c) => { res.push((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; };
  const out = () => pg.textContent('#out');
  ok('default $25 total fees $2.83', (await out()).includes('Total Etsy fees $2.83'));
  await pg.fill('#p', '1000'); await pg.fill('#c', '0'); await pg.check('#ads');
  ok('1000 ad 15% total 195.45', (await out()).includes('$195.45'));
  await pg.fill('#p', '100'); await pg.fill('#ts', '10000');
  ok('100 at 12% total 21.95', (await out()).includes('$21.95'));
  await pg.fill('#p', '-5');
  ok('negative rejected', (await pg.textContent('#err')).includes('cannot be negative') && (await out()) === '');
  ok('error region has role alert', (await pg.getAttribute('#err', 'role')) === 'alert');
  ok('result region live', (await pg.getAttribute('#out', 'aria-live')) === 'polite');
  const unl = await pg.$$eval('input', (els) => els.filter((e) => e.type === 'number' && !(e.labels && e.labels.length)).length);
  ok('every number input has a label', unl === 0);
  ok('no horizontal scroll at 375px', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await pg.screenshot({ path: process.env.SHOT || '/tmp/calc-mobile.png', fullPage: true });
  console.log(res.join('\n')); await b.close();
})();
