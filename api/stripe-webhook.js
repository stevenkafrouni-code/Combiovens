// api/stripe-webhook.js
// POST /api/stripe-webhook
// Stripe sends events here. On checkout.session.completed:
//  - idempotency guard: skip if session already processed
//  - marks quote as paid
//  - creates order record
//  - issues + stores referral code via lib/referral.js
//  - sends payment confirmation to customer
//  - sends order notification to admin
//  - if processing fails: logs error + emails admin alert (still returns 200 so Stripe stops retrying)

const Stripe = require('stripe');
const { updateQuote, appendToFile, readFile } = require('../lib/storage');
const { sendPaymentConfirmation, sendAdminOrderNotification } = require('../lib/email');

const SITE_URL  = process.env.SITE_URL  || 'https://www.combiovens.com.au';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sales@combiovens.com.au';
const FROM_EMAIL  = process.env.FROM_EMAIL  || 'sales@combiovens.com.au';

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

    // ── Idempotency guard ──────────────────────────────────────────────────────
    // Stripe retries webhooks — check we haven't already processed this session
    try {
      const orders = await readFile('data/orders.json').catch(() => []);
      if (orders.some(o => o.stripeSessionId === session.id)) {
        console.log(`Webhook duplicate — session ${session.id} already processed`);
        return res.status(200).json({ received: true, duplicate: true });
      }
    } catch (err) {
      console.error('Idempotency check failed:', err.message);
      // Continue processing — better to risk a duplicate than to drop an order
    }

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
        customerName:    customerName || quote?.customerName || quote?.name || '',
        email:           quote?.email  || session.customer_email || '',
        lines:           quote?.lines  || [],
        total:           quote?.total,
        totalIncGst:     session.amount_total / 100,
        stripeSessionId: session.id,
        timestamp:       new Date().toISOString(),
        status:          'confirmed',
      };
      await appendToFile('data/orders.json', order);

      // Fire both emails in parallel
      await Promise.allSettled([
        sendPaymentConfirmation({ order }),
        sendAdminOrderNotification({ order, supplierEmails: [] }),
      ]);

    } catch (err) {
      // Processing failed AFTER Stripe confirmed payment — this is serious
      // Log in detail and fire an emergency admin alert so nothing slips through
      console.error('CRITICAL — webhook processing failed for session', session.id, err);

      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from:    FROM_EMAIL,
          to:      ADMIN_EMAIL,
          subject: `[URGENT] Order processing failed — ${quoteId || session.id}`,
          text: [
            'A Stripe payment was received but order processing failed.',
            '',
            `Quote ID:   ${quoteId || 'unknown'}`,
            `Session ID: ${session.id}`,
            `Amount:     $${(session.amount_total / 100).toFixed(2)} AUD`,
            `Customer:   ${session.customer_email || 'unknown'}`,
            '',
            `Error: ${err.message}`,
            '',
            'Action required: manually create the order record and send confirmation to the customer.',
            `Stripe dashboard: https://dashboard.stripe.com/payments/${session.payment_intent}`,
          ].join('\n'),
        });
      } catch (alertErr) {
        console.error('Admin alert email also failed:', alertErr.message);
      }

      // Still return 200 — the payment is confirmed and the error is now on us to fix manually
    }
  }

  return res.status(200).json({ received: true });
};
