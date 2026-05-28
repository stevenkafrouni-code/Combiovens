// lib/email.js
// All outbound emails via Resend API

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const { signToken } = require('./token');

const FROM     = process.env.FROM_EMAIL  || 'sales@combiovens.com.au';
const ADMIN    = process.env.ADMIN_EMAIL || 'sales@combiovens.com.au';
const BRAND    = 'CombiOvens.com.au';
const PHONE    = '(03) 7009 3816';
const SITE_URL = process.env.SITE_URL    || 'https://www.combiovens.com.au';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatCurrency(n) {
  if (n == null) return 'POA';
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BRAND}</title>
<style>
  body{margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a}
  .wrap{max-width:600px;margin:0 auto;padding:40px 24px;background:#ffffff}
  .logo{font-size:22px;font-weight:900;letter-spacing:.02em;color:#1a1a1a;text-transform:uppercase;margin-bottom:40px}
  .logo span{color:#e85d04}
  h1{font-size:28px;font-weight:900;text-transform:uppercase;color:#1a1a1a;margin:0 0 8px}
  h2{font-size:18px;font-weight:700;text-transform:uppercase;color:#1a1a1a;margin:32px 0 12px}
  p{font-size:15px;line-height:1.65;color:#333333;margin:0 0 16px}
  .table{width:100%;border-collapse:collapse;margin:16px 0}
  .table th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#555555;padding:8px 12px;border-bottom:1px solid #dddddd;background:#f5f5f5}
  .table td{padding:12px;font-size:14px;border-bottom:1px solid #eeeeee;color:#1a1a1a}
  .table .num{text-align:right;font-family:monospace}
  .total-row td{font-weight:700;color:#1a1a1a;font-size:16px;border-top:2px solid #cccccc}
  .discount-row td{color:#e85d04}
  .btn{display:inline-block;background:#e85d04;color:#fff!important;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:14px 32px;border-radius:2px;text-decoration:none;margin:24px 0}
  .box{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:3px;padding:20px 24px;margin:20px 0}
  .box-orange{border-color:rgba(232,93,4,.4);background:rgba(232,93,4,.06)}
  .label{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#555555;margin-bottom:4px}
  .val{font-size:16px;font-weight:700;color:#1a1a1a}
  .orange{color:#e85d04}
  .footer{margin-top:48px;padding-top:24px;border-top:1px solid #dddddd;font-size:12px;color:#666666;line-height:1.7}
  .specs{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
  .spec{background:#eeeeee;color:#333333;font-size:11px;padding:3px 8px;border-radius:2px}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">COMBI<span>OVENS</span>.COM.AU</div>
  ${content}
  <div class="footer">
    <strong style="color:#a8a8a8">${BRAND}</strong><br>
    Authorised Australian Dealer — Atosa · CookRite · Classeq · Winterhalter · Jasper · MixRite<br>
    ${PHONE} · ${FROM}<br>
    We run on hospo hours — call any time you're working.<br><br>
    All prices ex GST. Full manufacturer warranty on all products.
  </div>
</div>
</body>
</html>`;
}

// ── 1. QUOTE TO ADMIN (for approval) ─────────────────────────────────────────
async function sendQuoteForApproval({ quote, lines, customerNote }) {
  function stockBadge(s) {
    if (!s) return '<span style="background:#eee;color:#999;border-radius:2px;padding:1px 6px;font-size:11px">?</span>';
    if (s.status === 'both')    return '<span style="background:#e8f5e9;color:#2a7a3b;border-radius:2px;padding:1px 6px;font-size:11px">✓ SYD &amp; PER</span>';
    if (s.status === 'partial') return `<span style="background:#fff3e0;color:#b45309;border-radius:2px;padding:1px 6px;font-size:11px">${s.syd === 'In Stock' ? '✓ SYD' : '✓ PER'} only</span>`;
    if (s.status === 'out')     return '<span style="background:#fce4ec;color:#b71c1c;border-radius:2px;padding:1px 6px;font-size:11px">✗ Out of Stock</span>';
    return '<span style="background:#eee;color:#999;border-radius:2px;padding:1px 6px;font-size:11px">? Not in Simco</span>';
  }

  const itemRows = lines.map(l => `
    <tr>
      <td>${l.sku}<br>${stockBadge(l.stock)}</td>
      <td>${l.name}</td>
      <td class="num">${l.qty}</td>
      <td class="num" style="color:#999;text-decoration:line-through">${formatCurrency(l.rrp)}</td>
      <td class="num">${formatCurrency(l.unitPrice)}</td>
      <td class="num">${formatCurrency(l.lineTotal)}</td>
    </tr>`).join('');

  const html = baseTemplate(`
    <h1>Quote Pending Approval</h1>
    <p>A new quote has been submitted and is waiting for your review. Review the details below and approve to send to the customer.</p>

    <div class="box">
      <div class="label">Customer</div>
      <div class="val">${(quote.customerName || quote.name || "Unknown")} ${quote.businessName ? "— " + quote.businessName : ""}</div>
      <div style="margin-top:8px;font-size:14px;color:#a8a8a8">
        ${quote.email} · ${quote.phone || 'No phone'} · Postcode: ${quote.postcode}
      </div>
      ${quote.referralCode ? `<div style="margin-top:8px"><span class="spec">Referral code: ${quote.referralCode}</span></div>` : ''}
    </div>

    ${quote.deliveryAccess ? `<div class="box">
      <div class="label">Delivery Access</div>
      <div style="margin-top:8px;font-size:14px;color:#333333">
        ${quote.deliveryAccess.groundFloor ? '<span style="display:inline-block;background:#e8f5e9;color:#2a7a3b;border-radius:2px;padding:2px 8px;margin:2px 2px 2px 0">✓ Ground floor</span>' : ''}
        ${quote.deliveryAccess.stairs      ? '<span style="display:inline-block;background:#fff3e0;color:#b45309;border-radius:2px;padding:2px 8px;margin:2px 2px 2px 0">⚠ Stairs / basement</span>' : ''}
        ${quote.deliveryAccess.dock        ? '<span style="display:inline-block;background:#e3f2fd;color:#1565c0;border-radius:2px;padding:2px 8px;margin:2px 2px 2px 0">↳ Loading dock</span>' : ''}
        ${quote.deliveryAccess.tailLift    ? '<span style="display:inline-block;background:#fce4ec;color:#b71c1c;border-radius:2px;padding:2px 8px;margin:2px 2px 2px 0">🚛 Tail-lift needed</span>' : ''}
      </div>
    </div>` : ''}

    ${customerNote ? `<div class="box"><div class="label">Customer Note</div><p style="margin:4px 0;color:#e8e4de">${customerNote}</p></div>` : ''}

    <h2>Quote Items</h2>
    <table class="table">
      <thead><tr><th>SKU / Stock</th><th>Product</th><th>Qty</th><th>RRP</th><th>Our Price</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="table">
      <tbody>
        <tr><td colspan="4" style="text-align:right;color:#6b6b6b">Subtotal</td><td class="num">${formatCurrency(quote.subtotal)}</td></tr>
        ${quote.discount ? `<tr class="discount-row"><td colspan="4" style="text-align:right">Referral Discount</td><td class="num">−${formatCurrency(quote.discount)}</td></tr>` : ''}
        <tr class="total-row"><td colspan="4" style="text-align:right">TOTAL (ex GST)</td><td class="num">${formatCurrency(quote.total)}</td></tr>
        <tr><td colspan="4" style="text-align:right;color:#6b6b6b">GST (10%)</td><td class="num">${formatCurrency(quote.total * 0.1)}</td></tr>
        <tr class="total-row"><td colspan="4" style="text-align:right">TOTAL (inc GST)</td><td class="num">${formatCurrency(quote.total * 1.1)}</td></tr>
      </tbody>
    </table>

    <a href="https://www.combiovens.com.au/api/approve?quoteId=${quote.quoteId}&pw=${process.env.ADMIN_PASSWORD || 'combiovens2026'}&data=${encodeURIComponent(Buffer.from(JSON.stringify(quote)).toString('base64'))}" class="btn">✓ Approve &amp; Send Quote</a>
    <a href="https://www.combiovens.com.au/api/reject?quoteId=${quote.quoteId}&pw=${process.env.ADMIN_PASSWORD || 'combiovens2026'}" style="margin-left:16px;color:#6b6b6b;font-size:13px">Reject</a>

    <p style="font-size:12px;color:#6b6b6b;margin-top:8px">Quote ID: ${quote.quoteId} · Submitted: ${quote.timestamp}</p>
  `);

  return resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `[APPROVE REQUIRED] Quote ${quote.quoteId} — ${quote.customerName} — ${formatCurrency(quote.total)}`,
    html,
  });
}

// ── 2. QUOTE TO CUSTOMER ──────────────────────────────────────────────────────
async function sendQuoteToCustomer({ quote, lines, claudeNote }) {
  const firstName = (quote.name || quote.customerName || 'there').split(' ')[0];
  const itemRows = lines.map(l => {
    const discountPct = l.rrp ? Math.round((1 - l.unitPrice / l.rrp) * 100) : null;
    const saving = l.rrp ? (l.rrp - l.unitPrice) * l.qty : null;
    const dimParts = [];
    if (l.capacity) dimParts.push(l.capacity);
    if (l.dims)     dimParts.push(l.dims);
    return `
      <tr>
        <td>
          <strong>${l.name}</strong><br>
          <span style="font-size:12px;color:#888">${l.sku}</span>${dimParts.length ? `<br><span style="font-size:11px;color:#aaa">${dimParts.join(' · ')}</span>` : ''}
        </td>
        <td class="num">${l.qty}</td>
        <td class="num" style="color:#888;text-decoration:line-through">${l.rrp ? formatCurrency(l.rrp) : 'POA'}</td>
        <td class="num">${formatCurrency(l.unitPrice)}${discountPct ? ` <span style="color:#e85d04;font-size:11px">(${discountPct}% off)</span>` : ''}</td>
        <td class="num" style="color:#2a9d5c">${saving ? formatCurrency(saving) : '-'}</td>
        <td class="num"><strong>${formatCurrency(l.lineTotal)}</strong></td>
      </tr>`;
  }).join('');
  const html = baseTemplate(`
    <h1>Your Quote</h1>
    <p>Hi ${firstName},</p>
    <p>${claudeNote || "Thanks for your enquiry — here's your itemised quote below. All prices ex GST and include full manufacturer warranty."}</p>

    <h2>Quote Summary</h2>
    <div class="box" style="margin-bottom:4px">
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:4px">Quote Reference</div>
      <div style="font-weight:700;color:#111">${quote.quoteId}</div>
    </div>

    <table class="table">
      <thead><tr><th>Product</th><th>Qty</th><th>RRP</th><th>Our Price</th><th>Saving</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="table">
      <tbody>
        <tr><td colspan="3" style="text-align:right;color:#6b6b6b">Subtotal (ex GST)</td><td class="num">${formatCurrency(quote.subtotal)}</td></tr>
        ${quote.discount ? `<tr class="discount-row"><td colspan="3" style="text-align:right">Referral Discount Applied</td><td class="num">−${formatCurrency(quote.discount)}</td></tr>` : ''}
        <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL (ex GST)</td><td class="num">${formatCurrency(quote.total)}</td></tr>
        <tr><td colspan="3" style="text-align:right;color:#6b6b6b">GST (10%)</td><td class="num">${formatCurrency(quote.total * 0.1)}</td></tr>
        <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL (inc GST)</td><td class="num">${formatCurrency(quote.total * 1.1)}</td></tr>
      </tbody>
    </table>

    <div style="background:#fff8f0;border:1px solid #f5d9b8;border-radius:3px;padding:16px 20px;margin:24px 0 8px;font-size:14px;color:#7a4a1a;line-height:1.6">
      <strong>A note on freight:</strong> Commercial kitchen equipment moves on pallets — it's heavy, it's bulky, and freight reflects that. For most metro deliveries, freight usually lands somewhere between <strong>$300–$900</strong> depending on the size of your order and where you are. We pass it on at cost with zero markup. No surprises, no margin — just the actual rate from the carrier.
    </div>

    <table style="width:100%;margin:16px 0 8px;border-collapse:collapse">
      <tr>
        <td style="width:50%;padding-right:8px">
          <a href="https://www.combiovens.com.au/api/checkout?quoteId=${quote.quoteId}" style="display:block;text-align:center;background:#e85d04;color:#fff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:16px 20px;border-radius:2px;text-decoration:none">
            Pay Now — ${formatCurrency(quote.total * 1.1)} inc GST
          </a>
          <p style="font-size:11px;color:#999;text-align:center;margin:6px 0 0">Equipment only · Freight invoiced separately at our cost</p>
        </td>
        <td style="width:50%;padding-left:8px">
          <a href="https://www.combiovens.com.au/api/freight-request?quoteId=${quote.quoteId}" style="display:block;text-align:center;background:#ffffff;color:#333;border:2px solid #cccccc;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:14px 20px;border-radius:2px;text-decoration:none">
            Request Freight Quote
          </a>
          <p style="font-size:11px;color:#999;text-align:center;margin:6px 0 0">We'll confirm freight cost ASAP</p>
        </td>
      </tr>
    </table>

    <div class="box" style="margin-top:24px">
      <div class="label">Why CombiOvens</div>
      <table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:14px;color:#333333">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eeeeee;vertical-align:top;width:18px;color:#e85d04;font-weight:700;line-height:1.4">→</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;line-height:1.5"><strong style="color:#1a1a1a">One brand per category, chosen on merit.</strong> We don't carry 20 brands with a rep on commission — we carry the pragmatic choice experienced operators make. Gear that works, lasts, has parts available in Australia, and real support when something goes wrong.</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eeeeee;vertical-align:top;color:#e85d04;font-weight:700;line-height:1.4">→</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;line-height:1.5"><strong style="color:#1a1a1a">Full manufacturer warranty, authorised dealer.</strong> Every brand we sell, backed properly. Not grey-import, not parallel stock.</td>
        </tr>
        <tr>
          <td style="padding:10px 0 0;vertical-align:top;color:#e85d04;font-weight:700;line-height:1.4">→</td>
          <td style="padding:10px 0 0 12px;vertical-align:top;line-height:1.5"><strong style="color:#1a1a1a">Real people, hospo hours.</strong> Questions answered fast by someone who knows the gear. Reply to this email or call ${PHONE} — happy to talk it through before you commit.</td>
        </tr>
      </table>
    </div>

    <div class="box" style="margin-top:32px">
      <div class="label">EFT Payment Details</div>
      <table style="width:100%;margin-top:12px;font-size:14px">
        <tr><td style="color:#555;width:120px;padding-bottom:6px">Account name</td><td style="color:#1a1a1a;font-weight:600">CODOTCOM PTY LTD</td></tr>
        <tr><td style="color:#555;padding-bottom:6px">BSB</td><td style="color:#1a1a1a;font-weight:600">067-873</td></tr>
        <tr><td style="color:#555;padding-bottom:6px">Account</td><td style="color:#1a1a1a;font-weight:600">23636056</td></tr>
        <tr><td style="color:#555">Reference</td><td style="color:#1a1a1a;font-weight:600">${quote.quoteId}</td></tr>
      </table>
    </div>

    ${quote.deliveryAccess && (quote.deliveryAccess.stairs || quote.deliveryAccess.dock || quote.deliveryAccess.tailLift) ? `
    <div class="box" style="margin-top:16px;border-color:#e0e0e0">
      <div class="label">Delivery Requirements Noted</div>
      <div style="margin-top:8px;font-size:13px;color:#555555">
        ${quote.deliveryAccess.stairs    ? '<span style="display:inline-block;background:#eee;border-radius:2px;padding:2px 8px;margin:2px">Stairs / basement</span>' : ''}
        ${quote.deliveryAccess.dock      ? '<span style="display:inline-block;background:#eee;border-radius:2px;padding:2px 8px;margin:2px">Loading dock</span>' : ''}
        ${quote.deliveryAccess.tailLift  ? '<span style="display:inline-block;background:#eee;border-radius:2px;padding:2px 8px;margin:2px">Tail-lift required</span>' : ''}
      </div>
    </div>` : ''}

    <p style="font-size:13px;color:#6b6b6b;margin-bottom:8px">This quote is valid for 14 days. Any questions — call us on ${PHONE}. We run on hospo hours.</p>
    <p style="font-size:12px;color:#999;line-height:1.6">Stock levels are checked with our suppliers at the time of quoting. Occasionally stock data lags or changes between quote and fulfilment — if any item on your order turns out to be unavailable, you will be refunded in full for that item with no hassle.</p>
  `);

  return resend.emails.send({
    from: FROM,
    to: quote.email,
    bcc: ADMIN,
    replyTo: ADMIN,
    subject: `Your Quote from CombiOvens.com.au — ${formatCurrency(quote.total)} ex GST`,
    html,
  });
}

// ── 3. PAYMENT CONFIRMATION + REFERRAL VOUCHER ────────────────────────────────
async function sendPaymentConfirmation({ order, referralCode, referralExpiry }) {
  const html = baseTemplate(`
    <h1>You're all sorted! 🎉</h1>
    <p>Hi ${order.customerName.split(' ')[0]},</p>
    <p>Payment received — your order is confirmed. We've placed it with the supplier and you'll receive delivery details shortly.</p>

    <div class="box">
      <div class="label">Order Reference</div>
      <div class="val">${order.orderId}</div>
      <div style="margin-top:8px;font-size:14px;color:#a8a8a8">Total paid: ${formatCurrency(order.total * 1.1)} inc GST</div>
    </div>

    <div class="box box-orange">
      <div class="label" style="color:#e85d04">Your $250 Referral Voucher</div>
      <div class="val" style="font-size:28px;letter-spacing:.1em;margin:8px 0">${referralCode}</div>
      <p style="margin:0;color:#e8e4de">Know someone who could use us? Give them this code — or use it yourself on your next order. $250 off, no minimum. Valid until <strong style="color:#fafaf8">${referralExpiry}</strong>.</p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b6b6b">Single use. They enter the code when submitting their quote.</p>
    </div>

    <h2>What happens next</h2>
    <div class="box">
      <p style="margin:0;color:#e8e4de;font-size:14px">
        ✓ Order placed with supplier today<br>
        ✓ You'll receive a delivery confirmation with ETA<br>
        ✓ Ground floor delivery to your site<br>
        ✓ Full manufacturer warranty applies from delivery date
      </p>
    </div>

    <p style="font-size:13px;color:#6b6b6b">Any issues — call ${PHONE}. We run on hospo hours, always.</p>
  `);

  return resend.emails.send({
    from: FROM,
    to: order.email,
    replyTo: ADMIN,
    subject: `Order Confirmed — CombiOvens.com.au — ${order.orderId}`,
    html,
  });
}

// ── 4. REFERRAL USED NOTIFICATION (to original referrer) ──────────────────────
async function sendReferralUsedNotification({ referrerEmail, referrerName, redeemedBy }) {
  const html = baseTemplate(`
    <h1>Your referral just scored someone $250</h1>
    <p>Hi ${referrerName.split(' ')[0]},</p>
    <p>Just letting you know — ${redeemedBy} just used your referral code and saved $250 on their order. Nice work spreading the word.</p>
    <p style="color:#6b6b6b;font-size:13px">CombiOvens.com.au — built by hospo, for hospo.</p>
  `);

  return resend.emails.send({
    from: FROM,
    to: referrerEmail,
    subject: `Your referral was just used — CombiOvens.com.au`,
    html,
  });
}

// ── 5. SUPPLIER ORDER EMAIL ───────────────────────────────────────────────────
async function sendSupplierOrder({ to, subject, body, orderId }) {
  return resend.emails.send({
    from: FROM,
    to,
    replyTo: ADMIN,
    subject,
    text: body, // supplier orders as plain text
    tags: [{ name: 'type', value: 'supplier-order' }, { name: 'orderId', value: orderId }],
  });
}

// ── 6. ADMIN ORDER NOTIFICATION ───────────────────────────────────────────────
async function sendAdminOrderNotification({ order, supplierEmails }) {
  const html = baseTemplate(`
    <h1>New Order — Action Required</h1>

    <div class="box">
      <div class="label">Order</div>
      <div class="val">${order.orderId}</div>
      <div style="margin-top:8px;font-size:14px;color:#a8a8a8">
        ${order.customerName} · ${order.email} · ${formatCurrency(order.total * 1.1)} inc GST
      </div>
    </div>

    <h2>Supplier Orders Sent</h2>
    ${supplierEmails.map(s => `
      <div class="box" style="margin-bottom:8px">
        <strong style="color:#fafaf8">${s.supplierName}</strong>
        <div style="font-size:13px;color:#a8a8a8;margin-top:4px">Sent to: ${s.to}</div>
        <div style="font-size:12px;color:#6b6b6b;margin-top:4px">${s.deliveryNote}</div>
      </div>
    `).join('')}

    <p style="font-size:12px;color:#6b6b6b">Referral voucher sent to customer. Google Sheets updated.</p>
  `);

  return resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `[ORDER PAID] ${order.orderId} — ${order.customerName} — ${formatCurrency(order.total * 1.1)}`,
    html,
  });
}

// ── FOLLOW-UP EMAIL HELPERS ───────────────────────────────────────────────────

function followUpFooter(quote) {
  const unsubUrl  = `${SITE_URL}/api/close-quote?quoteId=${quote.quoteId}&action=closed&token=${signToken(quote.quoteId, 'closed')}`;
  const quoteUrl  = `${SITE_URL}/api/checkout?quoteId=${quote.quoteId}`;
  return `
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #dddddd;font-size:12px;color:#999999;line-height:1.7">
      <strong style="color:#a8a8a8">${BRAND}</strong><br>
      Authorised Australian Dealer — Atosa · CookRite · Classeq · Winterhalter · Jasper · MixRite<br>
      ${PHONE} · ${FROM} · We run on hospo hours.<br><br>
      <a href="${quoteUrl}" style="color:#e85d04">View your quote</a> ·
      <a href="${unsubUrl}" style="color:#999999">Stop these reminders</a>
    </div>`;
}

function adminStopLink(quote) {
  const url = `${SITE_URL}/api/close-quote?quoteId=${quote.quoteId}&action=replied&token=${signToken(quote.quoteId, 'replied')}`;
  return `<p style="margin-top:24px;font-size:11px;color:#aaaaaa;text-align:center">
    Admin: <a href="${url}" style="color:#aaaaaa">[mark ${quote.quoteId} as replied — stop follow-ups]</a>
  </p>`;
}

function quoteExpiryDate(quote) {
  const d = new Date(quote.timestamp);
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── 7. FOLLOW-UP DAY 2 ────────────────────────────────────────────────────────
async function sendFollowUpDay2(quote) {
  const firstName = (quote.name || quote.customerName || 'there').split(' ')[0];
  const html = baseTemplate(`
    <p>Hi ${firstName},</p>
    <p>Just checking your quote <strong>${quote.quoteId}</strong> landed alright. No chase — I know fitting out a kitchen isn't a same-day decision.</p>
    <p>If anything's unclear — specs, lead times, whether a model's right for your volume — reply here or call ${PHONE}. You'll get a real person who knows the gear, not a call centre.</p>
    <p>Quote's locked in at the quoted price for 14 days.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${SITE_URL}/api/checkout?quoteId=${quote.quoteId}" class="btn">Pay Now — ${formatCurrency(quote.totalIncGst || quote.total * 1.1)} inc GST</a>
    </div>
    ${adminStopLink(quote)}
    ${followUpFooter(quote)}
  `);

  return resend.emails.send({
    from:    FROM,
    to:      quote.email,
    bcc:     ADMIN,
    replyTo: ADMIN,
    subject: `Your CombiOvens quote — anything I can clear up?`,
    html,
  });
}

// ── 8. FOLLOW-UP DAY 4 ────────────────────────────────────────────────────────
async function sendFollowUpDay4(quote) {
  const firstName = (quote.name || quote.customerName || 'there').split(' ')[0];
  const html = baseTemplate(`
    <p>Hi ${firstName},</p>
    <p>When you're comparing quotes, you'll notice most dealers carry a dozen brands per category. We carry one — the best one.</p>
    <p>That's deliberate. Twenty brands means a rep steering you to whatever pays the best commission that month. One brand, chosen on merit, means we actually know the gear inside out: what lasts, what parts are stocked in Australia, who picks up the phone when something goes wrong at 6pm on a Friday.</p>
    <p>Not the cheapest, not the dearest — the pragmatic choice experienced operators keep coming back to.</p>
    <p>Your quote <strong>${quote.quoteId}</strong> is still open. Reply any time.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${SITE_URL}/api/checkout?quoteId=${quote.quoteId}" class="btn">Pay Now — ${formatCurrency(quote.totalIncGst || quote.total * 1.1)} inc GST</a>
    </div>
    ${adminStopLink(quote)}
    ${followUpFooter(quote)}
  `);

  return resend.emails.send({
    from:    FROM,
    to:      quote.email,
    bcc:     ADMIN,
    replyTo: ADMIN,
    subject: `Why we only carry one brand per category`,
    html,
  });
}

// ── 9. FOLLOW-UP DAY 7 ────────────────────────────────────────────────────────
async function sendFollowUpDay7(quote) {
  const firstName = (quote.name || quote.customerName || 'there').split(' ')[0];
  const expiry = quoteExpiryDate(quote);
  const html = baseTemplate(`
    <p>Hi ${firstName},</p>
    <p>Your quote <strong>${quote.quoteId}</strong> is valid a few more days (until ${expiry}). After that, happy to refresh it — supplier pricing just shifts occasionally so I can't promise the same numbers.</p>
    <p>A couple of things that make pulling the trigger low-risk:</p>
    <div class="box" style="margin:20px 0">
      <p style="margin:0 0 8px;font-size:14px">✓ <strong>Freight passed on at cost, zero markup</strong> — no surprises</p>
      <p style="margin:0 0 8px;font-size:14px">✓ <strong>If anything's out of stock when we order</strong>, you're refunded in full for that item, no hassle</p>
      <p style="margin:0;font-size:14px">✓ <strong>Full manufacturer warranty, authorised dealer</strong></p>
    </div>
    <p>Confirm before 2pm and the order goes to the supplier same day. Reply or call ${PHONE} — happy to talk it through.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${SITE_URL}/api/checkout?quoteId=${quote.quoteId}" class="btn">Pay Now — ${formatCurrency(quote.totalIncGst || quote.total * 1.1)} inc GST</a>
    </div>
    ${adminStopLink(quote)}
    ${followUpFooter(quote)}
  `);

  return resend.emails.send({
    from:    FROM,
    to:      quote.email,
    bcc:     ADMIN,
    replyTo: ADMIN,
    subject: `Your quote expires soon — ${quote.quoteId}`,
    html,
  });
}

// ── 10. FOLLOW-UP DISPATCHER ──────────────────────────────────────────────────
async function sendFollowUp(quote, day) {
  if (day === 2) return sendFollowUpDay2(quote);
  if (day === 4) return sendFollowUpDay4(quote);
  if (day === 7) return sendFollowUpDay7(quote);
  throw new Error(`Unknown follow-up day: ${day}`);
}

module.exports = {
  sendQuoteForApproval,
  sendQuoteToCustomer,
  sendPaymentConfirmation,
  sendReferralUsedNotification,
  sendSupplierOrder,
  sendAdminOrderNotification,
  sendFollowUp,
};
