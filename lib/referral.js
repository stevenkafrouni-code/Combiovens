// lib/referral.js
// Referral code generation, validation and redemption
// Storage: data/referrals.json (GitHub-backed, same as quotes/orders)

const { readFile, appendToFile, writeFile } = require('./storage');

const REFERRAL_DISCOUNT = 250;   // AUD ex GST
const EXPIRY_MONTHS     = 6;
const CODE_PREFIX       = 'CBO';
const FILE              = 'data/referrals.json';

// Unambiguous character set — no 0/O, 1/I/L confusion
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const year = new Date().getFullYear();
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `${CODE_PREFIX}-${year}-${suffix}`;
}

function getExpiryDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Issue a new referral code post-purchase and persist to data/referrals.json
async function issueCode({ customerName, customerEmail, orderId }) {
  const code   = generateCode();
  const record = {
    code,
    issuedTo:    customerName,
    issuedEmail: customerEmail,
    orderId,
    issuedAt:    new Date().toISOString(),
    expiresAt:   getExpiryDate(),
    status:      'active',      // active | redeemed | expired
    redeemedBy:       null,
    redeemedEmail:    null,
    redeemedAt:       null,
    redeemedOrderId:  null,
  };

  await appendToFile(FILE, record);
  return { code, expiry: record.expiresAt, discount: REFERRAL_DISCOUNT };
}

// Validate a code — optionally pass submitterEmail to catch self-use
async function validateCode(code, submitterEmail = null) {
  if (!code || !code.trim()) return { valid: false, reason: 'No code provided' };

  const normalised = code.toUpperCase().trim();
  const referrals  = await readFile(FILE).catch(() => []);
  const record     = referrals.find(r => r.code === normalised);

  if (!record) return { valid: false, reason: 'Code not recognised' };

  if (record.status === 'redeemed') {
    return { valid: false, reason: 'This code has already been used' };
  }

  if (new Date() > new Date(record.expiresAt)) {
    // Lazily mark as expired
    await _updateRecord(referrals, normalised, { status: 'expired' });
    return { valid: false, reason: 'This code expired on ' + record.expiresAt };
  }

  // Self-referral check
  if (submitterEmail && record.issuedEmail &&
      submitterEmail.toLowerCase() === record.issuedEmail.toLowerCase()) {
    return { valid: false, reason: 'You cannot use your own referral code' };
  }

  return {
    valid:    true,
    code:     normalised,
    discount: REFERRAL_DISCOUNT,
    issuedTo: record.issuedTo,
    expiry:   record.expiresAt,
  };
}

// Mark a code as redeemed when payment is confirmed
async function redeemCode({ code, redeemedBy, redeemedEmail, orderId }) {
  const validation = await validateCode(code);
  if (!validation.valid) return { success: false, reason: validation.reason };

  const referrals = await readFile(FILE).catch(() => []);
  await _updateRecord(referrals, code.toUpperCase().trim(), {
    status:          'redeemed',
    redeemedBy,
    redeemedEmail,
    redeemedAt:      new Date().toISOString(),
    redeemedOrderId: orderId,
  });

  return { success: true };
}

// Helper — update a single record in the array and write back
async function _updateRecord(referrals, code, updates) {
  const idx = referrals.findIndex(r => r.code === code);
  if (idx === -1) return;
  referrals[idx] = { ...referrals[idx], ...updates };
  await writeFile(FILE, referrals);
}

module.exports = { generateCode, issueCode, validateCode, redeemCode, REFERRAL_DISCOUNT };
