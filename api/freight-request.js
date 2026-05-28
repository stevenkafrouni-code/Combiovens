// api/freight-request.js
// GET /api/freight-request?quoteId=CBO-XXXXX
// Customer clicked "Request Freight Quote" — notify admin, confirm to customer, redirect

const { readFile } = require('../lib/storage');
const { Resend }   = require('resend');

const resend   = new Resend(process.env.RESEND_API_KEY);
const FROM     = process.env.FROM_EMAIL  || 'sales@combiovens.com.au';
const ADMIN    = process.env.ADMIN_EMAIL || 'sales@combiovens.com.au';
const SITE_URL = process.env.SITE_URL    || 'https://www.combiovens.com.au';
const PHONE    = '(03) 7009 3816';

module.exports = async (req, res) => {
  const { quoteId } = req.query;
  if (!quoteId) return res.status(400).send('Missing quoteId');

  try {
    const quotes = await readFile('data/quotes.json').catch(() => []);
    const quote  = quotes.find(q => q.quoteId === quoteId);
    if (!quote) return res.status(404).send('Quote not found');

    const firstName  = (quote.customerName || quote.name || 'there').split(' ')[0];
    const itemSummary = (quote.lines || []).map(l => `${l.qty}× ${l.name}`).join(', ');
    const destination = [quote.suburb, quote.state, quote.postcode].filter(Boolean).join(' ');
    const accessNotes = [];
    if (quote.deliveryAccess?.stairs)   accessNotes.push('Stairs / basement');
    if (quote.deliveryAccess?.dock)     accessNotes.push('Loading dock');
    if (quote.deliveryAccess?.tailLift) accessNotes.push('Tail-lift required');

    // ── Email to admin ────────────────────────────────────────────────────────
    await resend.emails.send({
      from:    FROM,
      to:      ADMIN,
      subject: `[FREIGHT QUOTE NEEDED] ${quoteId} — ${quote.customerName} — ${destination}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
          <div style="font-size:22px;font-weight:900;text-transform:uppercase;margin-bottom:24px">
            COMBI<span style="color:#e85d04">OVENS</span>.COM.AU
          </div>
          <h2 style="margin:0 0 16px">Freight Quote Requested</h2>
          <p style="color:#333">A customer has requested a freight quote before paying. Get a rate and reply to them directly.</p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <tr><td style="padding:8px 0;color:#666;width:140px">Customer</td><td style="font-weight:600">${quote.customerName}${quote.businessName ? ' — ' + quote.businessName : ''}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Email</td><td><a href="mailto:${quote.email}">${quote.email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666">Phone</td><td>${quote.phone || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Deliver to</td><td style="font-weight:600">${destination || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Access</td><td>${accessNotes.length ? accessNotes.join(', ') : 'Ground floor (standard)'}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Quote ID</td><td>${quoteId}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Equipment</td><td>${itemSummary}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Equipment total</td><td style="font-weight:600">$${(quote.total * 1.1).toLocaleString('en-AU', {minimumFractionDigits:2})} inc GST</td></tr>
          </table>

          <p style="font-size:13px;color:#666">Reply to <a href="mailto:${quote.email}">${quote.email}</a> with the confirmed freight cost. Once agreed, send the updated Pay Now link:<br>
          <code style="background:#f5f5f5;padding:4px 8px;border-radius:3px;font-size:12px">${SITE_URL}/api/checkout?quoteId=${quoteId}</code></p>
        </div>`,
    });

    // ── Email to customer ─────────────────────────────────────────────────────
    await resend.emails.send({
      from:    FROM,
      to:      quote.email,
      replyTo: ADMIN,
      subject: `Freight Quote Request Received — ${quoteId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
          <div style="font-size:22px;font-weight:900;text-transform:uppercase;margin-bottom:32px">
            COMBI<span style="color:#e85d04">OVENS</span>.COM.AU
          </div>
          <h1 style="font-size:26px;margin:0 0 12px">We're on it, ${firstName}.</h1>
          <p style="color:#333;font-size:15px;line-height:1.6">We've received your freight quote request for <strong>${quoteId}</strong>. We'll get a rate for delivery to <strong>${destination}</strong> and come back to you shortly — usually within a few hours.</p>

          <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:3px;padding:20px 24px;margin:24px 0">
            <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#666;margin-bottom:8px">Your Equipment</div>
            <div style="font-size:14px;color:#333">${itemSummary}</div>
            <div style="margin-top:12px;font-size:14px;color:#333">Equipment total: <strong>$${(quote.total * 1.1).toLocaleString('en-AU', {minimumFractionDigits:2})} inc GST</strong></div>
          </div>

          <p style="color:#333;font-size:15px;line-height:1.6">Once we confirm the freight cost, we'll reply with the full total and a payment link. Any questions in the meantime — call us on <strong>${PHONE}</strong>. We run on hospo hours.</p>

          <div style="margin-top:40px;padding-top:24px;border-top:1px solid #ddd;font-size:12px;color:#888">
            CombiOvens.com.au · Authorised dealer for Atosa · CookRite · Classeq · Winterhalter · Jasper · MixRite<br>
            ${PHONE} · ${FROM}
          </div>
        </div>`,
    });

    // ── Redirect to confirmation page ─────────────────────────────────────────
    return res.redirect(`${SITE_URL}/freight-requested.html?quoteId=${quoteId}`);

  } catch (err) {
    console.error('Freight request error:', err);
    return res.status(500).send('Something went wrong. Please call us on ' + PHONE);
  }
};
