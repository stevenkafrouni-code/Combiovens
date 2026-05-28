// lib/token.js
// HMAC-signed tokens for one-click admin/unsubscribe links
// Token = first 24 chars of HMAC-SHA256(CRON_SECRET, payload)
// Payload is always "quoteId:action" — tied to a specific quote + action

const crypto = require('crypto');

function getSecret() {
  return process.env.CRON_SECRET || 'dev-fallback-do-not-use-in-prod';
}

function signToken(quoteId, action) {
  const payload = `${quoteId}:${action}`;
  return crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 24);
}

function verifyToken(quoteId, action, token) {
  if (!token || token.length !== 24) return false;
  const expected = signToken(quoteId, action);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(token, 'utf8'));
  } catch {
    return false;
  }
}

module.exports = { signToken, verifyToken };
