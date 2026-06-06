// api/checkout.js
// GET /api/checkout?quoteId=CBO-XXXXX
// Creates a Stripe Checkout session and redirects the customer to pay

const Stripe = require('stripe');
const { readFile } = require('../lib/storage');
const { buildQuoteLines } = require('../lib/products');

const SITE_URL = process.env.SITE_URL || 'https://www.combiovens.com.au';

module.exports = async (req, res) => {
  const { quoteId } = req.query;
  if (!quoteId) return res.status(400).send('Missing quoteId');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const quotes = await readFile('data/quotes.json').catch(() => []);
    const quote  = quotes.find(q => q.quoteId === quoteId);

    if (!quote) return res.status(404).send('Quote not found');
    if (quote.status === 'paid') {
      return res.redirect(`${SITE_URL}/payment-success.html?already=1`);
    }

    // Re-calculate prices fresh from current pricing.json so stale or
    // null-priced stored lines never reach Stripe with a $0 amount.
    const items = (quote.items || []).map(i => ({ sku: i.sku, qty: i.qty }));
    const { lines, subtotal } = items.length
      ? buildQuoteLines(items)
      : { lines: quote.lines || [], subtotal: quote.total || 0 };

    const validLines = lines.filter(l => l.unitPrice && l.unitPrice > 0 && !l.poa);
    if (!validLines.length) {
      return res.status(400).json({ error: 'No priceable items on this quote — please contact us.' });
    }

    // Build Stripe line items (ex GST) then add GST as a single line
    const exGstTotal = validLines.reduce((sum, l) => sum + (l.lineTotal || 0), 0);
    const lineItems = validLines.map(l => ({
      price_data: {
        currency: 'aud',
        product_data: {
          name: l.name,
          description: [l.sku, l.dims].filter(Boolean).join(' · '),
        },
        unit_amount: Math.round(l.unitPrice * 100), // cents, ex GST
      },
      quantity: l.qty,
    }));

    // GST line item
    lineItems.push({
      price_data: {
        currency: 'aud',
        product_data: { name: 'GST (10%)' },
        unit_amount: Math.round(exGstTotal * 0.1 * 100),
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: quote.email,
      metadata: {
        quoteId:      quote.quoteId,
        customerName: quote.customerName || quote.name || '',
      },
      payment_intent_data: {
        description: `CombiOvens — ${quote.quoteId}`,
        metadata: { quoteId: quote.quoteId },
      },
      custom_text: {
        submit: {
          message: 'Equipment only — freight is not included in this payment. We will calculate freight and send a separate invoice within 24 hours.',
        },
      },
      success_url: `${SITE_URL}/payment-success.html?quoteId=${quote.quoteId}`,
      cancel_url:  `${SITE_URL}`,
    });

    return res.redirect(303, session.url);

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
};
