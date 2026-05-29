// api/webhook.js
// DEPRECATED — this endpoint is no longer active.
// Stripe webhooks are handled by api/stripe-webhook.js
// This file is kept as a stub to return 410 Gone if Stripe is misconfigured
// to point here. Check Stripe Dashboard → Developers → Webhooks and confirm
// the endpoint is set to /api/stripe-webhook (not /api/webhook).

module.exports = async (req, res) => {
  console.warn('api/webhook.js called — this is a deprecated stub. Stripe should point to /api/stripe-webhook');
  return res.status(410).json({
    error: 'This endpoint is deprecated. Stripe webhook endpoint is /api/stripe-webhook',
  });
};
