// lib/products.js
// Product catalogue and pricing engine
// 
// PRICING STRUCTURE (Simco brands):
//   RRP         = Recommended Retail Price (ex GST)
//   Cost        = RRP × 0.60  (40% dealer discount — what we pay Simco)
//   Sell Price  = RRP × 0.65  (35% off RRP — what customer pays us)
//   Margin      = Sell - Cost = RRP × 0.05 per unit
//   Margin %    = ~7.7% of sell price
//
// WAREWASHING (Classeq / Winterhalter):
//   Dealer margin TBC — all warewashing items are POA until confirmed
//   Update pricing.json with actual cost once supplier confirms terms
//
// REFERRAL DISCOUNT:
//   $250 flat discount applied to order total (not per item)
//   Applied after all line item pricing

const PRODUCTS  = require('../data/products.json');
const PRICING   = require('../data/pricing.json');

// ── PRICE LOOKUP ──────────────────────────────────────────────────────────────

function getPrice(sku) {
  const p = PRICING[sku];
  if (!p) return { rrp: null, cost: null, sell: null, margin: null, poa: true };
  return {
    rrp:    p.rrp,
    cost:   p.cost,
    sell:   p.sell,
    margin: p.margin,
    poa:    !p.sell,
    costBasis: p.cost_basis || '',
    sellBasis: p.sell_basis || '',
  };
}

function getProduct(sku) {
  return PRODUCTS.find(p => p.sku === sku) || null;
}

// ── QUOTE BUILDER ─────────────────────────────────────────────────────────────

function buildQuoteLines(items) {
  // items = [{ sku, qty }]
  const lines   = [];
  let subtotal  = 0;
  let costTotal = 0;
  let hasPoaItems = false;

  for (const item of items) {
    const product = getProduct(item.sku);
    const price   = getPrice(item.sku);
    const qty     = parseInt(item.qty) || 1;

    if (!product) {
      lines.push({
        sku:       item.sku,
        name:      'Unknown SKU',
        qty,
        rrp:       null,
        unitCost:  null,
        unitPrice: null,
        lineTotal: null,
        lineCost:  null,
        lineMargin:null,
        poa:       true,
        error:     `SKU "${item.sku}" not found in catalogue`,
      });
      continue;
    }

    const unitPrice  = price.sell;
    const unitCost   = price.cost;
    const lineTotal  = unitPrice ? Math.round(unitPrice * qty * 100) / 100 : null;
    const lineCost   = unitCost  ? Math.round(unitCost  * qty * 100) / 100 : null;
    const lineMargin = (lineTotal && lineCost) ? Math.round((lineTotal - lineCost) * 100) / 100 : null;

    if (lineTotal) subtotal  += lineTotal;
    if (lineCost)  costTotal += lineCost;
    if (price.poa) hasPoaItems = true;

    lines.push({
      sku:        product.sku,
      name:       product.name,
      cat:        product.cat,
      qty,
      rrp:        price.rrp,
      unitCost,
      unitPrice,
      lineTotal,
      lineCost,
      lineMargin,
      poa:        price.poa,
      dims:       product.dims   || '',
      capacity:   product.capacity || '',
      type:       product.type   || '',
      img:        product.img,
    });
  }

  const totalMargin = subtotal - costTotal;

  return {
    lines,
    subtotal:     Math.round(subtotal * 100) / 100,
    costTotal:    Math.round(costTotal * 100) / 100,
    totalMargin:  Math.round(totalMargin * 100) / 100,
    marginPct:    subtotal > 0 ? Math.round((totalMargin / subtotal) * 1000) / 10 : 0,
    hasPoaItems,
    gst:          Math.round(subtotal * 0.1 * 100) / 100,
    totalIncGst:  Math.round(subtotal * 1.1 * 100) / 100,
  };
}

// ── REFERRAL DISCOUNT ─────────────────────────────────────────────────────────

const REFERRAL_DISCOUNT_AMOUNT = 250; // AUD ex GST

function applyReferralDiscount(subtotal) {
  const discount    = REFERRAL_DISCOUNT_AMOUNT;
  const total       = Math.max(0, subtotal - discount);
  const gst         = Math.round(total * 0.1 * 100) / 100;
  const totalIncGst = Math.round(total * 1.1 * 100) / 100;
  return { discount, total, gst, totalIncGst };
}

// ── STRIPE LINE ITEMS ─────────────────────────────────────────────────────────
// Build Stripe-compatible line items from quote lines (prices in cents, inc GST)

function buildStripeLineItems(lines, discount = 0) {
  const stripeItems = lines
    .filter(l => l.unitPrice && !l.poa)
    .map(l => ({
      price_data: {
        currency: 'aud',
        product_data: {
          name:     l.name,
          metadata: { sku: l.sku, dims: l.dims, capacity: l.capacity },
        },
        unit_amount: Math.round(l.unitPrice * 1.1 * 100), // inc GST, in cents
      },
      quantity: l.qty,
    }));

  if (discount > 0) {
    stripeItems.push({
      price_data: {
        currency: 'aud',
        product_data: { name: 'Referral Discount (inc GST)' },
        unit_amount: -Math.round(discount * 1.1 * 100), // negative, inc GST
      },
      quantity: 1,
    });
  }

  return stripeItems;
}

// ── ADMIN MARGIN SUMMARY ──────────────────────────────────────────────────────
// Internal-only — never sent to customer

function buildMarginSummary(lines, discount = 0) {
  const summary = lines.map(l => ({
    sku:        l.sku,
    name:       l.name,
    qty:        l.qty,
    unitCost:   l.unitCost,
    unitPrice:  l.unitPrice,
    lineMargin: l.lineMargin,
  }));

  const totalSell   = lines.reduce((s, l) => s + (l.lineTotal  || 0), 0);
  const totalCost   = lines.reduce((s, l) => s + (l.lineCost   || 0), 0);
  const totalMargin = lines.reduce((s, l) => s + (l.lineMargin || 0), 0);
  const afterDiscount = totalMargin - discount;

  return {
    lines: summary,
    totalSell:    Math.round(totalSell * 100) / 100,
    totalCost:    Math.round(totalCost * 100) / 100,
    totalMargin:  Math.round(totalMargin * 100) / 100,
    afterDiscount: Math.round(afterDiscount * 100) / 100,
    marginPct:    totalSell > 0 ? Math.round((afterDiscount / totalSell) * 1000) / 10 : 0,
  };
}

module.exports = {
  getProduct,
  getPrice,
  buildQuoteLines,
  applyReferralDiscount,
  buildStripeLineItems,
  buildMarginSummary,
  PRODUCTS,
  PRICING,
  REFERRAL_DISCOUNT_AMOUNT,
};
