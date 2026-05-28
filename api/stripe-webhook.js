// api/stripe-webhook.js
// POST /api/stripe-webhook
// Stripe sends events here. On checkout.session.completed:
//  - marks quote as paid
//  - creates order record
//  - sends payment confirmation to customer
//  - sends order notification to admin

const Stripe = require('stripe');
const { updateQuote, appendToFile } = require('../lib/storage');
const { sendPaymentConfirmation, sendAdminOrderNotification } = require('../lib/email');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe        = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session      = event.data.object;
    const quoteId      = session.metadata?.quoteId;
    const customerName = session.metadata?.customerName;

    try {
      // Mark quote as paid
      const quote = await updateQuote(quoteId, {
        status:          'paid',
        paidAt:          new Date().toISOString(),
        stripeSessionId: session.id,
        amountPaid:      session.amount_total / 100,
      });

      // Create order record
      const orderId = 'ORD-' + Date.now().toString().slice(-8);
      const order = {
        orderId,
        quoteId,
        customerName:    customerName || quote.customerName || quote.name || '',
        email:           quote.email  || session.customer_email || '',
        lines:           quote.lines  || [],
        total:           quote.total,
        totalIncGst:     session.amount_total / 100,
        stripeSessionId: session.id,
        timestamp:       new Date().toISOString(),
        status:          'confirmed',
      };
      await appendToFile('data/orders.json', order);

      // Referral voucher for customer
      const referralCode   = 'REFER-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const referralExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

      // Fire both emails in parallel
      await Promise.allSettled([
        sendPaymentConfirmation({ order, referralCode, referralExpiry }),
        sendAdminOrderNotification({ order, supplierEmails: [] }),
      ]);

    } catch (err) {
      console.error('Webhook processing error:', err);
      // Return 200 so Stripe doesn't keep retrying
    }
  }

  return res.status(200).json({ received: true });
};
