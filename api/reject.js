// api/reject.js
// GET /api/reject/[quoteId]
// Admin rejects a quote — logs it, no email sent to customer

const { getRows, updateQuoteStatus } = require('../lib/sheets');

module.exports = async (req, res) => {
  const { quoteId } = req.query;
  if (!quoteId) return res.status(400).send('Missing quote ID');

  try {
    const rows = await getRows('Quotes');
    const quoteRow = rows.find(r => r['QuoteId'] === quoteId);
    if (!quoteRow) return res.status(404).send('Quote not found');

    await updateQuoteStatus(quoteId, {
      Status: 'rejected',
      ApprovedAt: new Date().toISOString(),
    });

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0e0e0e;color:#e8e4de">
        <h2 style="color:#6b6b6b">Quote Rejected</h2>
        <p>Quote <strong>${quoteId}</strong> has been marked as rejected. No email was sent to the customer.</p>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).send('Error: ' + err.message);
  }
};
