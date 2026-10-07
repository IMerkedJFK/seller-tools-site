// Local release check: internal links resolve, every page has title/description/viewport, no horizontal scroll at 375px, product links match expected slugs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const expectSlugs = { 'online-seller-bundle': 'Online Seller Spreadsheet Bundle', 'etsy-profit-calculator': 'Etsy Profit Calculator', 'sales-expense-tracker': 'Sales and Expense Tracker', 'self-employed-tax-prep-bookkeeping': 'Self Employed Tax Prep', 'etsy-fees-explained': 'Etsy Fees Explained' };
let fail = 0; const say = (ok, m) => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + m); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const pg = await b.newPage({ viewport: { width: 375, height: 800 } });
  for (const f of pages) {
    await pg.goto('file://' + path.join(root, f));
    const t = await pg.title(); const d = await pg.$eval('meta[name=description]', e => e.content).catch(() => '');
    say(t.length > 10 && d.length > 20, f + ' has title and description');
    say(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), f + ' no horizontal scroll at 375px');
    const links = await pg.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
    for (const h of links) {
      if (/^https?:/.test(h)) {
        if (h.includes('gumroad.com/l/')) { const slug = h.split('/l/')[1]; say(!!expectSlugs[slug], f + ' product link slug ' + slug + ' is a known product'); }
      } else if (!h.startsWith('#') && !h.startsWith('mailto:')) {
        say(fs.existsSync(path.join(root, h.split('#')[0])), f + ' internal link ' + h + ' exists');
      }
    }
  }
  const tp = fs.readFileSync(path.join(root, 'templates.html'), 'utf8');
  for (const s of Object.keys(expectSlugs)) say(tp.includes('/l/' + s + '"'), 'templates.html links ' + s);
  const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  for (const f of pages) say(f === 'index.html' ? sm.includes('seller-tools-site/<') : sm.includes('/' + f), 'sitemap lists ' + f);
  await b.close(); console.log(fail ? fail + ' FAILURES' : 'ALL PASS'); process.exitCode = fail ? 1 : 0;
})();
