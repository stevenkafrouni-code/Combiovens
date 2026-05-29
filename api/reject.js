// api/reject.js
// GET /api/reject?quoteId=CBO-XXXXX&pw=ADMIN_PASSWORD
// Admin rejects a quote — marks it closed, no email sent to customer

const { updateQuote } = require('../lib/storage');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

module.exports = async (req, res) => {
  const { quoteId, pw } = req.query;

  if (pw !== ADMIN_PASSWORD || !ADMIN_PASSWORD) {
    return res.status(401).send('Unauthorised');
  }
  if (!quoteId) return res.status(400).send('Missing quoteId');

  try {
    await updateQuote(quoteId, {
      status:     'rejected',
      rejectedAt: new Date().toISOString(),
    });

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0e0e0e;color:#e8e4de;text-align:center">
        <div style="font-size:40px;margin-bottom:16px">✕</div>
        <h2 style="color:#6b6b6b">Quote Rejected</h2>
        <p style="color:#a8a8a8">Quote <strong>${quoteId}</strong> marked as rejected. No email sent to customer.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Reject error:', err);
    return res.status(500).send('Error: ' + err.message);
  }
};
