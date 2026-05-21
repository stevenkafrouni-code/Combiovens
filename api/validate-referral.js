// api/validate-referral.js
// POST /api/validate-referral
// Called by frontend when user enters a referral code

const { validateCode } = require('../lib/referral');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://combiovens.com.au');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code } = req.body;
  if (!code) return res.status(400).json({ valid: false, reason: 'No code provided' });

  try {
    const result = await validateCode(code);
    return res.status(200).json({
      valid: result.valid,
      reason: result.reason || null,
      discount: result.valid ? 250 : 0,
      expiry: result.expiry || null,
    });
  } catch (err) {
    console.error('Referral validation error:', err);
    return res.status(500).json({ valid: false, reason: 'Could not validate code. Please try again.' });
  }
};
