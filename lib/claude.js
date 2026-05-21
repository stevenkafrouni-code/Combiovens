// lib/claude.js
// Anthropic Claude integration
// Used for: quote personalisation, order validation, supplier comms

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// ── 1. VALIDATE AND ENRICH A QUOTE ───────────────────────────────────────────
// Claude reviews the quote before it goes to admin for approval
async function validateQuote({ customer, lines, subtotal, total, referralUsed }) {
  const itemSummary = lines.map(l =>
    `- ${l.qty}x ${l.name} (${l.sku}) @ ${l.unitPrice ? '$' + l.unitPrice : 'POA'} = ${l.lineTotal ? '$' + l.lineTotal : 'POA'}`
  ).join('\n');

  const prompt = `You are the backend AI for CombiOvens.com.au, an authorised commercial kitchen equipment dealer in Australia.

A quote has been submitted. Review it and return a JSON object with your assessment.

CUSTOMER:
Name: ${customer.name}
Business: ${customer.businessName || 'Not provided'}
Email: ${customer.email}
Phone: ${customer.phone || 'Not provided'}
Postcode: ${customer.postcode}
Notes: ${customer.notes || 'None'}

QUOTE ITEMS:
${itemSummary}

Subtotal: $${subtotal}
${referralUsed ? `Referral discount applied: -$250` : ''}
Total: $${total}

Return ONLY valid JSON with these fields:
{
  "approved": true/false,
  "flags": ["list any concerns - missing info, unusual quantities, mismatched items, etc"],
  "customerNote": "A warm, professional 1-2 sentence note to include in the quote email to the customer. Acknowledge their specific equipment choice briefly. Do not mention pricing.",
  "adminNote": "Brief internal note for the business owner reviewing this quote. Flag anything unusual.",
  "suggestedItems": ["optional: SKUs of complementary items worth mentioning, max 2"]
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return {
      approved: true,
      flags: [],
      customerNote: 'Thanks for your quote request — we\'ve reviewed your selection and everything looks great.',
      adminNote: 'Auto-validation parse error — please review manually.',
      suggestedItems: [],
    };
  }
}

// ── 2. WRITE SUPPLIER ORDER EMAILS ───────────────────────────────────────────
async function writeSupplierEmail({ supplier, items, customer, orderId }) {
  const PRODUCTS = require('../data/products.json');

  const itemDetails = items.map(item => {
    const p = PRODUCTS.find(pr => pr.sku === item.sku);
    return `${item.qty}x ${p?.name || item.sku} (${item.sku})${p?.dims ? ' — ' + p.dims : ''}`;
  }).join('\n');

  const prompt = `You are placing a purchase order on behalf of CombiOvens.com.au (authorised dealer) with ${supplier.name}.

Write a professional, concise supplier order email. Be direct and clear — suppliers are busy.

SUPPLIER: ${supplier.name}
CONTACT: ${supplier.contactName}
ORDER ID: ${orderId}

ITEMS TO ORDER:
${itemDetails}

DELIVER TO:
${customer.name} / ${customer.businessName || ''}
${customer.address || 'Address TBC — will follow'}
${customer.postcode}
Phone: ${customer.phone || 'TBC'}
Notes: ${customer.deliveryNotes || 'Ground floor delivery'}

IMPORTANT:
- We are an authorised dealer
- Reply-to is sales@combiovens.com.au
- Request confirmation of stock availability and estimated dispatch date
- ${supplier.deliveryNote}

Return ONLY the email body text (no subject line, no JSON wrapper).`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── 3. GENERATE REFERRAL VOUCHER COPY ────────────────────────────────────────
async function writeReferralVoucherCopy({ customerName, referralCode, expiry }) {
  // Simple — just personalise the voucher message slightly
  const prompt = `Write a single warm, punchy paragraph (2-3 sentences max) to include in a post-purchase email for CombiOvens.com.au. 

The customer (${customerName.split(' ')[0]}) has just paid for their order. We're giving them a $250 referral voucher (code: ${referralCode}, expires ${expiry}) to share with someone in hospitality.

Tone: friendly, industry-insider, not corporate. Reference hospo culture naturally. Don't use exclamation marks more than once.

Return ONLY the paragraph text.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

// ── 4. HANDLE EDGE CASES ─────────────────────────────────────────────────────
// Called when something unusual happens - Claude decides what to do
async function handleEdgeCase({ type, context }) {
  const prompt = `You are the AI operations manager for CombiOvens.com.au.

An edge case has occurred that needs a decision:

TYPE: ${type}
CONTEXT: ${JSON.stringify(context, null, 2)}

Possible types: duplicate_order | invalid_sku | payment_failed | supplier_bounce | referral_fraud_suspected

Return JSON:
{
  "action": "approve | reject | flag | hold | notify_admin",
  "reason": "brief explanation",
  "adminMessage": "message to send to admin",
  "customerMessage": "message to send to customer if needed, or null"
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return { action: 'notify_admin', reason: 'Parse error', adminMessage: `Edge case: ${type}`, customerMessage: null };
  }
}

module.exports = { validateQuote, writeSupplierEmail, writeReferralVoucherCopy, handleEdgeCase };
// cache bust Thu 21 May 2026 16:35:55 AEST
