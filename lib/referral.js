// lib/referral.js
// Referral code generation, validation and redemption
// Storage: Google Sheets (tab: Referral_Codes)

const { getSheet } = require('./sheets');

const REFERRAL_DISCOUNT = 250;      // AUD
const EXPIRY_MONTHS     = 6;
const CODE_PREFIX       = 'CBO';    // CombiOvens

// Generate a unique referral code e.g. CBO-2026-A3X9
function generateCode() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${CODE_PREFIX}-${year}-${suffix}`;
}

function getExpiryDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Issue a new referral code for a customer post-purchase
async function issueCode({ customerName, customerEmail, orderId }) {
  const sheet = await getSheet('Referral_Codes');
  const code = generateCode();
  const issued = new Date().toISOString().split('T')[0];
  const expiry = getExpiryDate();

  await sheet.addRow({
    Code: code,
    IssuedTo: customerName,
    IssuedEmail: customerEmail,
    OrderId: orderId,
    IssuedDate: issued,
    ExpiryDate: expiry,
    Status: 'active',       // active | redeemed | expired
    RedeemedBy: '',
    RedeemedEmail: '',
    RedeemedDate: '',
    RedeemedOrderId: '',
  });

  return { code, expiry, discount: REFERRAL_DISCOUNT };
}

// Validate a referral code on quote submission
async function validateCode(code) {
  if (!code || code.trim() === '') return { valid: false, reason: 'No code provided' };

  const sheet = await getSheet('Referral_Codes');
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('Code') === code.toUpperCase().trim());

  if (!row) return { valid: false, reason: 'Code not recognised' };

  if (row.get('Status') === 'redeemed') {
    return { valid: false, reason: 'This code has already been used' };
  }

  const expiry = new Date(row.get('ExpiryDate'));
  if (new Date() > expiry) {
    // Auto-mark as expired
    row.set('Status', 'expired');
    await row.save();
    return { valid: false, reason: 'This code expired on ' + row.get('ExpiryDate') };
  }

  return {
    valid: true,
    code,
    discount: REFERRAL_DISCOUNT,
    issuedTo: row.get('IssuedTo'),
    expiry: row.get('ExpiryDate'),
    rowRef: row,
  };
}

// Mark a code as redeemed when order is confirmed
async function redeemCode({ code, redeemedBy, redeemedEmail, orderId }) {
  const validation = await validateCode(code);
  if (!validation.valid) return { success: false, reason: validation.reason };

  const row = validation.rowRef;
  row.set('Status', 'redeemed');
  row.set('RedeemedBy', redeemedBy);
  row.set('RedeemedEmail', redeemedEmail);
  row.set('RedeemedDate', new Date().toISOString().split('T')[0]);
  row.set('RedeemedOrderId', orderId);
  await row.save();

  return { success: true };
}

module.exports = { generateCode, issueCode, validateCode, redeemCode, REFERRAL_DISCOUNT };
