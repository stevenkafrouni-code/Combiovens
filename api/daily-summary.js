// api/daily-summary.js
// GET /api/daily-summary
// Called daily at 8am AEST (22:00 UTC) via Vercel cron
// Sends a summary of the past 24hrs to admin

const { readFile }  = require('../lib/storage');
const { Resend }    = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN  = process.env.ADMIN_EMAIL || 'steven@misspickle.com.au';
const FROM   = process.env.FROM_EMAIL  || 'sales@combiovens.com.au';

function fmt(n) {
  if (n == null) return 'POA';
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = async (req, res) => {
  // Allow manual trigger with ?pw= as well as Vercel cron (which sends CRON_SECRET header)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const pw         = req.query.pw;

  const validCron   = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validManual = pw && pw === process.env.ADMIN_PASSWORD;

  if (!validCron && !validManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const since = Date.now() - 24 * 60 * 60 * 1000; // last 24hrs

    const [allQuotes, allOrders] = await Promise.all([
      readFile('data/quotes.json').catch(() => []),
      readFile('data/orders.json').catch(() => []),
    ]);

    const quotes = allQuotes.filter(q => q.timestamp && new Date(q.timestamp).getTime() > since);
    const orders = allOrders.filter(o => o.timestamp && new Date(o.timestamp).getTime() > since);

    const quoteTotal  = quotes.reduce((s, q) => s + (q.totalIncGst || 0), 0);
    const orderTotal  = orders.reduce((s, o) => s + (o.totalIncGst || 0), 0);

    const quoteRows = quotes.length
      ? quotes.map(q => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de">${q.quoteId}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de">${q.name || q.customerName || '—'}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#a8a8a8">${q.email}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de;text-align:right;font-family:monospace">${fmt(q.totalIncGst)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#6b6b6b">${q.status || '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#6b6b6b;font-size:13px">No quotes in the last 24 hours</td></tr>';

    const orderRows = orders.length
      ? orders.map(o => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de">${o.orderId}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de">${o.customerName || '—'}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#e8e4de;text-align:right;font-family:monospace">${fmt(o.totalIncGst)}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="padding:20px;text-align:center;color:#6b6b6b;font-size:13px">No orders in the last 24 hours</td></tr>';

    const date = new Date().toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Australia/Sydney' });

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0e0e0e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:40px 24px">
  <div style="font-family:'Helvetica Neue',sans-serif;font-size:20px;font-weight:900;letter-spacing:.02em;color:#fafaf8;text-transform:uppercase;margin-bottom:32px">
    COMBI<span style="color:#e85d04">OVENS</span>.COM.AU
  </div>

  <h1 style="font-size:26px;font-weight:900;text-transform:uppercase;color:#fafaf8;margin:0 0 4px">Daily Summary</h1>
  <p style="font-size:14px;color:#6b6b6b;margin:0 0 32px">${date}</p>

  <div style="display:flex;gap:16px;margin-bottom:32px">
    <div style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:20px 24px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;margin-bottom:6px">Quotes</div>
      <div style="font-size:32px;font-weight:900;color:#fafaf8;line-height:1">${quotes.length}</div>
      <div style="font-size:13px;color:#a8a8a8;margin-top:4px">${fmt(quoteTotal)} inc GST</div>
    </div>
    <div style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:20px 24px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;margin-bottom:6px">Orders</div>
      <div style="font-size:32px;font-weight:900;color:#e85d04;line-height:1">${orders.length}</div>
      <div style="font-size:13px;color:#a8a8a8;margin-top:4px">${fmt(orderTotal)} inc GST</div>
    </div>
    <div style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:20px 24px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;margin-bottom:6px">Total Pipeline</div>
      <div style="font-size:32px;font-weight:900;color:#00b4a6;line-height:1">${fmt(quoteTotal + orderTotal)}</div>
      <div style="font-size:13px;color:#a8a8a8;margin-top:4px">inc GST · 24hrs</div>
    </div>
  </div>

  <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8a8a8;margin:0 0 12px">Quotes</h2>
  <table style="width:100%;border-collapse:collapse;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;margin-bottom:32px">
    <thead>
      <tr style="background:#242424">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Quote ID</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Customer</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Email</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Total</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Status</th>
      </tr>
    </thead>
    <tbody>${quoteRows}</tbody>
  </table>

  <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8a8a8;margin:0 0 12px">Orders</h2>
  <table style="width:100%;border-collapse:collapse;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;margin-bottom:40px">
    <thead>
      <tr style="background:#242424">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Order ID</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Customer</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b">Total</th>
      </tr>
    </thead>
    <tbody>${orderRows}</tbody>
  </table>

  <p style="font-size:12px;color:#3a3a3a;border-top:1px solid #1a1a1a;padding-top:24px">
    CombiOvens.com.au · Daily summary · Sent automatically at 8am AEST
  </p>
</div>
</body></html>`;

    await resend.emails.send({
      from:    FROM,
      to:      ADMIN,
      subject: `CombiOvens Daily — ${quotes.length} quote${quotes.length !== 1 ? 's' : ''}, ${orders.length} order${orders.length !== 1 ? 's' : ''} · ${date}`,
      html,
    });

    return res.status(200).json({ ok: true, quotes: quotes.length, orders: orders.length });

  } catch (err) {
    console.error('Daily summary error:', err);
    return res.status(500).json({ error: err.message });
  }
};
