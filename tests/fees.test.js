const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fees.js');
const base = { price: 25, shipping: 0, taxRate: 0, cost: 0, targetMargin: 40, ads: false, fx: false, trailingSales: '' };
const c = (o) => F.calculate(Object.assign({}, base, o));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b);

test('review regression: $1000 item, 15% ads, capped, total $195.45', () => {
  const r = c({ price: 1000, ads: true });
  assert.equal(r.fees.offsiteAds, 100); assert.equal(r.fees.total, 195.45);
});
test('review regression: $100 item, qualifying 12%, total $21.95', () => {
  const r = c({ price: 100, ads: true, trailingSales: 10000 });
  assert.equal(r.adRate, 0.12); assert.equal(r.fees.total, 21.95);
});
test('review regression: $100 at 15% is $24.95 (the old fixed assumption, still valid for under $10k shops)', () => {
  assert.equal(c({ price: 100, ads: true, trailingSales: 500 }).fees.total, 24.95);
});
test('ads off adds nothing; $25 baseline fees $2.83', () => {
  const r = c({}); assert.equal(r.fees.offsiteAds, 0); assert.equal(r.fees.total, 2.83); assert.equal(r.profit, 22.17);
});
test('eligibility boundary: 9999.99 is 15%, 10000 is 12%, 10000.01 is 12%, blank is 15%', () => {
  assert.equal(F.offsiteRate(9999.99), 0.15); assert.equal(F.offsiteRate(10000), 0.12);
  assert.equal(F.offsiteRate(10000.01), 0.12); assert.equal(F.offsiteRate(''), 0.15);
});
test('cap boundary at 15%: below ($666.66), at ($666.67 about), above', () => {
  assert.equal(c({ price: 600, ads: true }).fees.offsiteAds, 90);
  assert.equal(c({ price: 666.66, ads: true }).fees.offsiteAds, 100); // 99.999 rounds to 100.00
  assert.equal(c({ price: 666.67, ads: true }).fees.offsiteAds, 100);
  assert.equal(c({ price: 2000, ads: true }).fees.offsiteAds, 100);
});
test('cap boundary at 12%: $833.33 is 100.00 (99.9996), $800 is 96', () => {
  assert.equal(c({ price: 800, ads: true, trailingSales: 20000 }).fees.offsiteAds, 96);
  assert.equal(c({ price: 900, ads: true, trailingSales: 20000 }).fees.offsiteAds, 100);
});
test('ad base includes shipping', () => {
  assert.equal(c({ price: 90, shipping: 10, ads: true }).fees.offsiteAds, 15);
});
test('shipping is in transaction and processing base', () => {
  const r = c({ price: 20, shipping: 5 });
  assert.equal(r.fees.transaction, 1.63); assert.equal(r.fees.processing, 1.0);
});
test('sales tax raises processing fee only, not transaction fee', () => {
  const a = c({ price: 100 }), b = c({ price: 100, taxRate: 10 });
  assert.equal(a.fees.transaction, b.fees.transaction);
  near(b.fees.processing - a.fees.processing, 0.30, 0.0001);
  assert.equal(b.buyerPays, 110);
});
test('currency conversion only when selected, 2.5% of item plus shipping', () => {
  assert.equal(c({ price: 100 }).fees.currency, 0);
  assert.equal(c({ price: 100, fx: true }).fees.currency, 2.5);
});
test('invalid inputs are rejected with messages', () => {
  const bad = [
    [{ price: -5 }, /cannot be negative/], [{ price: 0 }, /more than zero/], [{ price: '' }, /required/],
    [{ price: 'abc' }, /must be a number/], [{ shipping: -1 }, /cannot be negative/], [{ cost: -1 }, /cannot be negative/],
    [{ price: 1e9 }, /unusually large/], [{ price: NaN }, /must be a number/], [{ price: Infinity }, /must be a number/],
    [{ targetMargin: 100 }, /less than 100/], [{ targetMargin: -1 }, /from 0/], [{ taxRate: 50 }, /30%/]
  ];
  bad.forEach(([o, re]) => { const r = c(o); assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.errors.join(' '), re); });
});
test('blank optional inputs count as zero; blank margin skips target', () => {
  const r = c({ shipping: '', cost: '', taxRate: '', targetMargin: '' });
  assert.equal(r.ok, true); assert.equal(r.targetItemPrice, undefined);
});
test('displayed total equals sum of displayed lines', () => {
  [9.99, 13.37, 24.5, 77.77, 333.33, 1234.56].forEach((p) => {
    [false, true].forEach((ads) => {
      const f = c({ price: p, shipping: 3.33, taxRate: 7.25, ads, fx: true }).fees;
      near(f.listing + f.transaction + f.processing + f.offsiteAds + f.currency, f.total, 0.0001, 'p=' + p);
    });
  });
});
test('break even: profit about zero at the returned price (within rounding of fee lines)', () => {
  [[0,false,''],[4,false,''],[4,true,''],[4,true,20000],[250,true,''],[800,true,20000]].forEach(([cost, ads, ts]) => {
    const r = c({ cost, ads, trailingSales: ts, shipping: 0 });
    const be = c({ price: r.breakEvenItemPrice, cost, ads, trailingSales: ts });
    near(be.profit, 0, 0.03, 'cost=' + cost);
  });
});
test('break even and target price handle the cap region', () => {
  const r = c({ cost: 700, ads: true, targetMargin: 30 });
  const chk = c({ price: r.targetItemPrice, cost: 700, ads: true });
  assert.equal(chk.fees.offsiteAds, 100);
  near(chk.margin, 0.30, 0.001);
});
test('target margin round trip in normal region', () => {
  const r = c({ cost: 4, targetMargin: 40 });
  assert.equal(r.targetItemPrice, 8.81);
  near(c({ price: r.targetItemPrice, cost: 4 }).margin, 0.40, 0.005);
});
test('unachievable margin returns null, not a fake price', () => {
  assert.equal(c({ targetMargin: 95, cost: 4 }).targetItemPrice, null);
  assert.equal(c({ targetMargin: 92, ads: true }).targetItemPrice, null);
  // 90% with ads is reachable only far above the cap, and the result must be self consistent
  const far = c({ targetMargin: 90, ads: true }).targetItemPrice;
  assert.ok(far > 10000); near(c({ price: far, ads: true }).margin, 0.90, 0.001);
});
test('zero cost, zero shipping, zero margin target is finite', () => {
  const r = c({ cost: 0, targetMargin: 0 }); assert.ok(isFinite(r.targetItemPrice) && r.targetItemPrice > 0);
});
test('large but valid input stays finite', () => {
  const r = c({ price: 5000000, ads: true, cost: 1000, taxRate: 10 });
  assert.equal(r.ok, true); assert.equal(r.fees.offsiteAds, 100); assert.ok(isFinite(r.profit));
});
