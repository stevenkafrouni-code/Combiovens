// api/approve.js
// GET /api/approve/[quoteId]
// Admin clicks approve link in email → quote is sent to customer

const { getRows, updateQuoteStatus } = require('../lib/sheets');
const { buildQuoteLines, applyReferralDiscount, buildStripeLineItems } = require('../lib/products');
const { sendQuoteToCustomer } = require('../lib/email');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const { quoteId } = req.query;

  if (!quoteId) return res.status(400).send('Missing quote ID');

  try {
    // ── Fetch quote from Sheets ───────────────────────────────────────────────
    const rows = await getRows('Quotes');
    const quoteRow = rows.find(r => r['QuoteId'] === quoteId);

    if (!quoteRow) return res.status(404).send('Quote not found: ' + quoteId);
    if (quoteRow['Status'] !== 'pending_approval') {
      return res.status(400).send(`Quote ${quoteId} is already ${quoteRow['Status']}`);
    }

    const items = JSON.parse(quoteRow['Items']);
    const { lines } = buildQuoteLines(items);
    const discount = parseFloat(quoteRow['Discount']) || 0;

    const quote = {
      quoteId,
      customerName: quoteRow['CustomerName'],
      businessName: quoteRow['BusinessName'],
      email: quoteRow['Email'],
      phone: quoteRow['Phone'],
      postcode: quoteRow['Postcode'],
      subtotal: parseFloat(quoteRow['Subtotal']),
      discount,
      total: parseFloat(quoteRow['Total']),
      referralCode: quoteRow['ReferralCode'],
    };

    // ── Create Stripe Payment Link ────────────────────────────────────────────
    // Build line items for Stripe
    const stripeLineItems = buildStripeLineItems(lines, discount);

    const paymentLink = await stripe.paymentLinks.create({
      line_items: stripeLineItems,
      metadata: { quoteId },
      after_completion: {
        type: 'redirect',
        redirect: { url: `https://combiovens.com.au/thankyou?order=${quoteId}` },
      },
      payment_method_types: ['card', 'paypal'],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `CombiOvens.com.au — Quote ${quoteId}`,
          metadata: { quoteId },
          footer: 'Authorised Australian Dealer. Full manufacturer warranty. ABN: [YOUR_ABN]',
        },
      },
    });

    // ── Send quote to customer with payment link ───────────────────────────────
    await sendQuoteToCustomer({
      quote: { ...quote, paymentUrl: paymentLink.url },
      lines,
    });

    // ── Update status in Sheets ───────────────────────────────────────────────
    await updateQuoteStatus(quoteId, {
      Status: 'sent',
      ApprovedAt: new Date().toISOString(),
      PaymentLink: paymentLink.url,
    });

    // ── Respond to admin ──────────────────────────────────────────────────────
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0e0e0e;color:#e8e4de">
        <h2 style="color:#e85d04">✓ Quote Sent</h2>
        <p>Quote <strong>${quoteId}</strong> has been sent to <strong>${quote.email}</strong>.</p>
        <p>Payment link: <a href="${paymentLink.url}" style="color:#e85d04">${paymentLink.url}</a></p>
      </body></html>
    `);

  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).send('Error: ' + err.message);
  }
};
