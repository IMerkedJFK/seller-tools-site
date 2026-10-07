/* Etsy fee model, US seller baseline. Source: etsy.com/legal/fees and etsy.com/legal/etsy-payments, reviewed 2026-10-07.
   Not a worldwide model. Refunds and returns are not modelled. */
(function (root) {
  var RULES = {
    listingFee: 0.20,
    transactionRate: 0.065,
    processingRate: 0.03,
    processingFixed: 0.25,
    offsiteStandard: 0.15,
    offsiteQualified: 0.12,
    offsiteThreshold: 10000,
    offsiteCap: 100,
    fxRate: 0.025,
    maxInput: 10000000
  };
  function r2(x) { return Math.round(x * 100 + 1e-7) / 100; }
  function num(v) {
    if (v === '' || v === null || v === undefined) return { blank: true, v: 0 };
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    return { blank: false, v: n };
  }
  /* 12% applies when the shop made $10,000 or more in sales over the prior 365 days. Under that, 15%. */
  function offsiteRate(trailingSales) {
    var t = num(trailingSales);
    if (t.blank || !isFinite(t.v) || t.v < 0) return RULES.offsiteStandard;
    return t.v >= RULES.offsiteThreshold ? RULES.offsiteQualified : RULES.offsiteStandard;
  }
  function validate(inp) {
    var errs = [];
    var spec = [
      ['price', 'Item price', true, true],
      ['shipping', 'Shipping charged', false, false],
      ['taxRate', 'Sales tax rate', false, false],
      ['cost', 'Your cost', false, false],
      ['trailingSales', 'Prior 365 day sales', false, false]
    ];
    spec.forEach(function (s) {
      var n = num(inp[s[0]]);
      if (n.blank) { if (s[2]) errs.push(s[1] + ' is required.'); return; }
      if (!isFinite(n.v)) errs.push(s[1] + ' must be a number.');
      else if (n.v < 0) errs.push(s[1] + ' cannot be negative. Refunds and returns are not modelled.');
      else if (n.v > RULES.maxInput) errs.push(s[1] + ' is unusually large (over ' + RULES.maxInput + ').');
      else if (s[3] && n.v === 0) errs.push(s[1] + ' must be more than zero.');
      else if (s[0] === 'taxRate' && n.v > 30) errs.push('Sales tax rate must be 30% or less.');
    });
    var m = num(inp.targetMargin);
    if (!m.blank) {
      if (!isFinite(m.v)) errs.push('Target margin must be a number.');
      else if (m.v < 0 || m.v >= 100) errs.push('Target margin must be from 0 to less than 100.');
    }
    return errs;
  }
  function feesFor(R, o) {
    var tax = R * o.t;
    var tx = r2(RULES.transactionRate * R);
    var proc = r2(RULES.processingRate * (R + tax) + RULES.processingFixed);
    var ads = o.adRate ? r2(Math.min(o.adRate * R, RULES.offsiteCap)) : 0;
    var fx = o.fx ? r2(RULES.fxRate * R) : 0;
    var listing = RULES.listingFee;
    return { listing: listing, transaction: tx, processing: proc, offsiteAds: ads, currency: fx,
             total: r2(listing + tx + proc + ads + fx) };
  }
  /* Solve R from  R - fees(R) - cost = m*R, handling the $100 ad cap. Returns null if unreachable. */
  function solveR(cost, m, o) {
    var base = RULES.listingFee + RULES.processingFixed + cost;
    var rateNoAds = RULES.transactionRate + RULES.processingRate * (1 + o.t) + (o.fx ? RULES.fxRate : 0);
    var coefU = 1 - rateNoAds - o.adRate - m;
    if (coefU > 1e-12) {
      var Ru = base / coefU;
      if (o.adRate * Ru <= RULES.offsiteCap + 1e-9) return Ru;
    }
    if (!o.adRate) return null;
    var coefC = 1 - rateNoAds - m;
    if (coefC > 1e-12) {
      var Rc = (base + RULES.offsiteCap) / coefC;
      if (o.adRate * Rc >= RULES.offsiteCap - 1e-9) return Rc;
    }
    return null;
  }
  function calculate(inp) {
    var errs = validate(inp);
    if (errs.length) return { ok: false, errors: errs };
    var price = num(inp.price).v, ship = num(inp.shipping).v, cost = num(inp.cost).v;
    var t = num(inp.taxRate).v / 100;
    var mb = num(inp.targetMargin);
    var m = mb.blank ? null : mb.v / 100;
    var adRate = inp.ads ? offsiteRate(inp.trailingSales) : 0;
    var o = { t: t, adRate: adRate, fx: !!inp.fx };
    var R = price + ship;
    var f = feesFor(R, o);
    var profit = r2(R - f.total - cost);
    var out = { ok: true, errors: [], revenue: r2(R), fees: f, profit: profit,
                margin: R > 0 ? profit / R : 0, adRate: adRate, buyerPays: r2(R + R * t) };
    var be = solveR(cost, 0, o);
    out.breakEvenItemPrice = be === null ? null : Math.max(0, r2(be - ship));
    if (m !== null) {
      var tg = solveR(cost, m, o);
      out.targetItemPrice = tg === null ? null : Math.max(0, r2(tg - ship));
    }
    return out;
  }
  var api = { RULES: RULES, calculate: calculate, validate: validate, offsiteRate: offsiteRate, feesFor: feesFor, r2: r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EtsyFees = api;
})(typeof window !== 'undefined' ? window : this);
