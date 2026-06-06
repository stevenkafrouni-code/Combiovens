// api/approve.js
const { buildQuoteLines, buildStripeLineItems } = require('../lib/products');
const { updateQuote, readFile }                 = require('../lib/storage');
const { sendQuoteToCustomer }                   = require('../lib/email');
const { verifyToken }                           = require('../lib/token');

module.exports = async (req, res) => {
  const { quoteId, token, data } = req.query;

  // Auth: HMAC-signed token tied to this quoteId + action
  // Token is generated in lib/email.js when the admin email is sent
  if (!quoteId)                                    return res.status(400).send('Missing quoteId');
  if (!verifyToken(quoteId, 'approve', token))     return res.status(401).send('Unauthorised — invalid or expired approval token');
  if (!data)                                       return res.status(400).send('Missing data — quote cannot be decoded. Please resubmit the quote form.');

  let quote;
  try {
    const decoded = Buffer.from(decodeURIComponent(data), 'base64').toString('utf8');
    quote = JSON.parse(decoded);
  } catch (err) {
    return res.status(400).send(`Could not decode quote data: ${err.message}. Raw data length: ${data?.length}`);
  }

  try {
    // Idempotency — don't create a second payment link if already approved
    const quotes = await readFile('data/quotes.json').catch(() => []);
    const stored = quotes.find(q => q.quoteId === quoteId);
    if (stored?.paymentLink) {
      return res.status(200).send(`
        <html><body style="font-family:sans-serif;padding:60px;background:#0e0e0e;color:#e8e4de;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">ℹ️</div>
          <h2 style="color:#e85d04;font-size:24px;margin-bottom:8px">Already Approved</h2>
          <p style="color:#a8a8a8">${quoteId} was already sent to ${quote.email}.</p>
          <p style="margin-top:16px"><a href="${stored.paymentLink}" style="color:#e85d04">Payment link ↗</a></p>
        </body></html>
      `);
    }

    const { lines } = buildQuoteLines(quote.items.map(i => ({ sku: i.sku, qty: i.qty })));

    let paymentUrl = null;
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'placeholder') {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const stripeItems = buildStripeLineItems(lines, quote.discount || 0);
      if (stripeItems.length) {
        const link = await stripe.paymentLinks.create({
          line_items: stripeItems,
          metadata: { quoteId },
          after_completion: { type: 'redirect', redirect: { url: `https://www.combiovens.com.au/thankyou?order=${quoteId}` } },
          payment_method_types: ['card'],
          invoice_creation: { enabled: true },
        });
        paymentUrl = link.url;
      }
    }

    await sendQuoteToCustomer({ quote: { ...quote, paymentUrl }, lines });
    await updateQuote(quoteId, { status: 'sent', approvedAt: new Date().toISOString(), paymentLink: paymentUrl });

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:60px;background:#0e0e0e;color:#e8e4de;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="color:#00b4a6;font-size:24px;margin-bottom:8px">Quote Sent</h2>
        <p style="color:#a8a8a8">${quoteId} → ${quote.email}</p>
        ${paymentUrl ? `<p style="margin-top:16px"><a href="${paymentUrl}" style="color:#e85d04">Payment link ↗</a></p>` : ''}
      </body></html>
    `);

  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).send('Error: ' + err.message);
  }
};
