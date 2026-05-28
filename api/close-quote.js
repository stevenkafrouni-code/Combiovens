// api/close-quote.js
// GET /api/close-quote?quoteId=CBO-XXXXX&action=replied|closed&token=XXXX
//
// action=replied — admin one-click after a phone/email conversation
// action=closed  — customer unsubscribe link (Australian Spam Act compliance)
//
// Token is HMAC-signed (lib/token.js) — unguessable, no login required

const { updateQuote } = require('../lib/storage');
const { verifyToken }  = require('../lib/token');

const VALID_ACTIONS = ['replied', 'closed'];

module.exports = async (req, res) => {
  const { quoteId, action, token } = req.query;

  if (!quoteId || !action || !token) {
    return res.status(400).send(page('Missing parameters', 'The link appears to be incomplete. Please contact us directly.'));
  }

  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).send(page('Invalid request', 'Unrecognised action.'));
  }

  if (!verifyToken(quoteId, action, token)) {
    return res.status(403).send(page('Link invalid', 'This link is invalid or has expired. Please contact us directly on (03) 7009 3816.'));
  }

  try {
    await updateQuote(quoteId, {
      status:   action,
      closedAt: new Date().toISOString(),
    });

    if (action === 'replied') {
      return res.send(page(
        'Follow-up stopped',
        `Quote ${quoteId} marked as replied. No further automated emails will be sent for this quote.`,
      ));
    }

    // action === 'closed' — customer unsubscribe
    return res.send(page(
      'Unsubscribed',
      `Done — you won't receive any more follow-up emails about quote ${quoteId}. The quote itself remains valid for 14 days if you change your mind. You can always call us on (03) 7009 3816.`,
    ));

  } catch (err) {
    console.error('close-quote error:', err);
    return res.status(500).send(page('Something went wrong', 'Please call us on (03) 7009 3816 and we\'ll sort it out.'));
  }
};

function page(heading, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — CombiOvens.com.au</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#0e0e0e;color:#e8e4de;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 24px}
  .card{max-width:480px;text-align:center}
  .logo{font-size:20px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;color:#fafaf8;margin-bottom:40px}
  .logo span{color:#e85d04}
  h1{font-size:28px;font-weight:900;text-transform:uppercase;color:#fafaf8;margin-bottom:16px}
  p{font-size:15px;line-height:1.65;color:#a8a8a8}
  a{color:#e85d04}
</style>
</head>
<body>
  <div class="card">
    <div class="logo">COMBI<span>OVENS</span>.COM.AU</div>
    <h1>${heading}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
