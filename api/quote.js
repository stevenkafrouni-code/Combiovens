// api/quote.js
// POST /api/quote
// Full quote submission flow with proper pricing, validation and approval routing

const { buildQuoteLines, applyReferralDiscount, buildMarginSummary } = require('../lib/products');
const { validateCode }          = require('../lib/referral');
const { validateQuote }         = require('../lib/claude');
const { appendToFile }          = require('../lib/storage');
const { sendQuoteToCustomer }   = require('../lib/email');
const { enrichLinesWithStock }  = require('../lib/stock');

function generateQuoteId() {
  const now  = new Date();
  const yy   = now.getFullYear().toString().slice(2);
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CBO-${yy}${mm}${dd}-${rand}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.combiovens.com.au');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      customerName,
      businessName,
      email,
      phone,
      postcode,
      address,
      suburb,
      state,
      items,          // [{ sku, qty, desc }]
      referralCode,
      notes,
      deliveryNotes,
      deliveryAccess, // { groundFloor, stairs, dock, tailLift }
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    const errors = [];
    if (!customerName?.trim())  errors.push('Full name is required');
    if (!email?.trim())         errors.push('Email address is required');
    if (!postcode?.trim())      errors.push('Postcode is required');
    if (!/^\d{4}$/.test(postcode?.trim())) errors.push('Postcode must be 4 digits');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim())) errors.push('Invalid email address');
    if (!items?.length)         errors.push('No items in quote');
    if (items?.length) {
      items.forEach((item, i) => {
        if (!item.sku?.trim()) errors.push(`Item ${i + 1}: SKU is required`);
        if (!item.qty || item.qty < 1) errors.push(`Item ${i + 1}: Quantity must be at least 1`);
      });
    }

    if (errors.length) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    // ── Build and price quote lines ───────────────────────────────────────────
    const { lines: rawLines, subtotal, costTotal, totalMargin, hasPoaItems, gst, totalIncGst } =
      buildQuoteLines(items.map(i => ({ sku: i.sku.trim().toUpperCase(), qty: parseInt(i.qty) })));

    const unknownSkus = rawLines.filter(l => l.error);
    if (unknownSkus.length) {
      return res.status(400).json({
        error: `Unknown SKUs: ${unknownSkus.map(l => l.sku).join(', ')}. Please check and resubmit.`,
      });
    }

    // Block POA items — every submitted quote must be fully priced so follow-up
    // automation can treat status:'sent' as complete with no exclusion logic
    const poaSkus = rawLines.filter(l => l.poa);
    if (poaSkus.length) {
      return res.status(400).json({
        error: `${poaSkus.map(l => l.sku).join(', ')} ${poaSkus.length === 1 ? 'requires' : 'require'} a custom quote. Call us on (03) 7009 3816 and we'll sort it out.`,
      });
    }

    // ── Enrich lines with stock availability ─────────────────────────────────
    const lines = await enrichLinesWithStock(rawLines).catch(() => rawLines);

    // ── Validate referral code ────────────────────────────────────────────────
    let discount    = 0;
    let referralMsg = null;
    const cleanCode = referralCode?.trim().toUpperCase() || '';

    if (cleanCode) {
      const validation = await validateCode(cleanCode);
      if (!validation.valid) {
        return res.status(400).json({ error: `Referral code: ${validation.reason}` });
      }
      discount    = 250;
      referralMsg = `Code ${cleanCode} applied — $250 discount`;
    }

    // ── Calculate totals ──────────────────────────────────────────────────────
    const { total, gst: finalGst, totalIncGst: finalIncGst } =
      discount ? applyReferralDiscount(subtotal) : { total: subtotal, gst, totalIncGst };

    const marginSummary = buildMarginSummary(lines, discount);

    const quoteId   = generateQuoteId();
    const timestamp = new Date().toISOString();

    const customer = {
      name:          customerName.trim(),
      businessName:  businessName?.trim() || '',
      email:         email.trim().toLowerCase(),
      phone:         phone?.trim() || '',
      postcode:      postcode.trim(),
      address:       address?.trim() || '',
      suburb:        suburb?.trim() || '',
      state:         state?.trim() || '',
      notes:         notes?.trim() || '',
      deliveryNotes: deliveryNotes?.trim() || '',
      deliveryAccess: deliveryAccess || {},
    };

    const quote = {
      quoteId,
      timestamp,
      ...customer,
      items,
      referralCode: cleanCode,
      subtotal,
      discount,
      total,
      gst:          finalGst,
      totalIncGst:  finalIncGst,
      hasPoaItems,
      status:       'sent',
    };

    // ── Claude validates ──────────────────────────────────────────────────────
    const aiReview = await validateQuote({
      customer,
      lines,
      subtotal,
      total,
      referralUsed: !!discount,
    });

    // ── Store quote and customer ──────────────────────────────────────────────
    await appendToFile('data/quotes.json', quote);
    await appendToFile('data/customers.json', customer);

    // ── Send quote directly to customer ───────────────────────────────────────
    await sendQuoteToCustomer({
      quote,
      lines,
      claudeNote: aiReview?.customerNote,
    });

    return res.status(200).json({
      success:    true,
      quoteId,
      hasPoaItems,
      message:    hasPoaItems
        ? 'Quote received. Some items are POA — we\'ll confirm pricing and be in touch shortly.'
        : 'Quote received. You\'ll have it in your inbox within the hour.',
    });

  } catch (err) {
    console.error('Quote submission error:', err);
    return res.status(500).json({
      error: 'Something went wrong on our end. Please call us on (03) 7009 3816.',
    });
  }
};
