// api/webhook.js
// POST /api/webhook
// Stripe sends payment events here
// On checkout.session.completed → fire the full post-payment loop

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const { getRows, updateQuoteStatus, logOrder, redeemReferralCode, logReferralCode } = require('../lib/sheets');
const { buildQuoteLines } = require('../lib/products');
const { issueCode } = require('../lib/referral');
const { groupBySupplier, buildOrderEmail } = require('../lib/suppliers');
const { writeSupplierEmail, writeReferralVoucherCopy } = require('../lib/claude');
const {
  sendPaymentConfirmation,
  sendSupplierOrder,
  sendAdminOrderNotification,
  sendReferralUsedNotification,
} = require('../lib/email');

// Vercel: disable body parsing so Stripe signature check works
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── PAYMENT COMPLETE ──────────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const quoteId = session.metadata?.quoteId;

    if (!quoteId) {
      console.error('No quoteId in session metadata');
      return res.status(200).json({ received: true });
    }

    try {
      await processPayment({ session, quoteId });
    } catch (err) {
      console.error('Post-payment error:', err);
      // Don't return error to Stripe — acknowledge receipt, handle internally
    }
  }

  return res.status(200).json({ received: true });
};

async function processPayment({ session, quoteId }) {
  // ── 1. Fetch quote ────────────────────────────────────────────────────────
  const rows = await getRows('Quotes');
  const quoteRow = rows.find(r => r['QuoteId'] === quoteId);
  if (!quoteRow) throw new Error(`Quote not found: ${quoteId}`);

  const items = JSON.parse(quoteRow['Items']);
  const { lines } = buildQuoteLines(items);

  const orderId = quoteId.replace('CBO-', 'ORD-');
  const customer = {
    name: quoteRow['CustomerName'],
    businessName: quoteRow['BusinessName'],
    email: quoteRow['Email'],
    phone: quoteRow['Phone'],
    postcode: quoteRow['Postcode'],
    deliveryNotes: quoteRow['DeliveryNotes'],
  };

  const total = parseFloat(quoteRow['Total']);
  const referralCode = quoteRow['ReferralCode'];

  // ── 2. Log order ──────────────────────────────────────────────────────────
  await logOrder({
    orderId, quoteId,
    timestamp: new Date().toISOString(),
    customerName: customer.name,
    email: customer.email,
    total,
    stripePaymentId: session.payment_intent,
    status: 'paid',
  });

  // ── 3. Update quote status ────────────────────────────────────────────────
  await updateQuoteStatus(quoteId, {
    Status: 'paid',
    PaidAt: new Date().toISOString(),
    StripePaymentId: session.payment_intent,
  });

  // ── 4. Redeem referral code if used ──────────────────────────────────────
  if (referralCode) {
    const codeRows = await getRows('Referral_Codes');
    const codeRow = codeRows.find(r => r['Code'] === referralCode);
    if (codeRow) {
      await redeemReferralCode(referralCode, {
        redeemedBy: customer.name,
        redeemedEmail: customer.email,
        orderId,
      });
      // Notify the referrer
      await sendReferralUsedNotification({
        referrerEmail: codeRow['IssuedEmail'],
        referrerName: codeRow['IssuedTo'],
        redeemedBy: customer.name,
      });
    }
  }

  // ── 5. Issue new referral code for this customer ──────────────────────────
  const { code: newCode, expiry: newExpiry } = await issueCode({
    customerName: customer.name,
    customerEmail: customer.email,
    orderId,
  });

  // ── 6. Send supplier orders ───────────────────────────────────────────────
  const supplierGroups = groupBySupplier(lines);
  const supplierEmailsSent = [];

  for (const [supplierKey, { supplier, items: supplierItems }] of Object.entries(supplierGroups)) {
    // Claude writes the actual email body
    const emailBody = await writeSupplierEmail({
      supplier,
      items: supplierItems,
      customer,
      orderId,
    });

    const emailData = buildOrderEmail(supplierKey, {
      orderId,
      date: new Date().toLocaleDateString('en-AU'),
      customer,
      items: supplierItems,
    });

    await sendSupplierOrder({
      to: emailData.to,
      subject: emailData.subject,
      body: emailBody, // Claude's version
      orderId,
    });

    supplierEmailsSent.push({
      supplierName: supplier.name,
      to: emailData.to,
      deliveryNote: supplier.deliveryNote,
    });
  }

  // ── 7. Send confirmation + voucher to customer ────────────────────────────
  await sendPaymentConfirmation({
    order: { orderId, customerName: customer.name, email: customer.email, total },
    referralCode: newCode,
    referralExpiry: newExpiry,
  });

  // ── 8. Notify admin ───────────────────────────────────────────────────────
  await sendAdminOrderNotification({
    order: { orderId, customerName: customer.name, email: customer.email, total },
    supplierEmails: supplierEmailsSent,
  });

  console.log(`✅ Order ${orderId} processed successfully`);
}
