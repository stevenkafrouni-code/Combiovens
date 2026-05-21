// lib/sheets.js
// Google Sheets integration for data persistence
// Tabs: Quotes | Orders | Referral_Codes | Customers

const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_ID = process.env.GOOGLE_SHEETS_ID;

let _auth = null;

async function getAuth() {
  if (_auth) return _auth;
  _auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
  return _auth;
}

async function getSheets() {
  const auth = await getAuth();
  return google.sheets({ version: 'v4', auth });
}

// Simple wrapper - append a row to a named tab
async function appendRow(tabName, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

// Read all rows from a tab
async function getRows(tabName) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:Z`,
  });
  const [headers, ...rows] = res.data.values || [];
  if (!headers) return [];
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

// Update a specific cell by finding a row that matches a key column
async function updateRow(tabName, keyCol, keyVal, updates) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:Z`,
  });
  const [headers, ...rows] = res.data.values || [];
  const keyIdx = headers.indexOf(keyCol);
  const rowIdx = rows.findIndex(r => r[keyIdx] === keyVal);
  if (rowIdx === -1) throw new Error(`Row not found: ${keyCol}=${keyVal}`);

  const sheetRowNum = rowIdx + 2; // +1 for header, +1 for 1-indexed
  for (const [col, val] of Object.entries(updates)) {
    const colIdx = headers.indexOf(col);
    if (colIdx === -1) continue;
    const colLetter = String.fromCharCode(65 + colIdx);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!${colLetter}${sheetRowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[val]] },
    });
  }
}

// ── QUOTES ────────────────────────────────────────────────────────────────────
async function logQuote(quote) {
  // quote = { quoteId, customerName, businessName, email, phone, postcode, items, subtotal, discount, total, referralCode, status, timestamp }
  await appendRow('Quotes', [
    quote.quoteId,
    quote.timestamp,
    quote.customerName,
    quote.businessName,
    quote.email,
    quote.phone,
    quote.postcode,
    JSON.stringify(quote.items),
    quote.subtotal,
    quote.discount || 0,
    quote.total,
    quote.referralCode || '',
    quote.status,      // draft | sent | accepted | invoiced | paid
    '',                // approvedAt
    '',                // invoiceId
    '',                // paidAt
  ]);
}

async function updateQuoteStatus(quoteId, updates) {
  await updateRow('Quotes', 'QuoteId', quoteId, updates);
}

// ── REFERRAL CODES ────────────────────────────────────────────────────────────
async function logReferralCode({ code, issuedTo, issuedEmail, orderId, expiry }) {
  await appendRow('Referral_Codes', [
    code,
    issuedTo,
    issuedEmail,
    orderId,
    new Date().toISOString().split('T')[0],
    expiry,
    'active',
    '', '', '', '',
  ]);
}

async function getReferralCode(code) {
  const rows = await getRows('Referral_Codes');
  return rows.find(r => r['Code'] === code.toUpperCase().trim()) || null;
}

async function redeemReferralCode(code, { redeemedBy, redeemedEmail, orderId }) {
  await updateRow('Referral_Codes', 'Code', code, {
    Status: 'redeemed',
    RedeemedBy: redeemedBy,
    RedeemedEmail: redeemedEmail,
    RedeemedDate: new Date().toISOString().split('T')[0],
    RedeemedOrderId: orderId,
  });
}

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
async function logCustomer({ name, businessName, email, phone, postcode }) {
  const rows = await getRows('Customers');
  const exists = rows.find(r => r['Email'] === email);
  if (!exists) {
    await appendRow('Customers', [
      email, name, businessName, phone, postcode,
      new Date().toISOString().split('T')[0],
      1, // orderCount
    ]);
  } else {
    // Increment order count
    const count = parseInt(exists['OrderCount'] || '0') + 1;
    await updateRow('Customers', 'Email', email, { OrderCount: count });
  }
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
async function logOrder(order) {
  await appendRow('Orders', [
    order.orderId,
    order.quoteId,
    order.timestamp,
    order.customerName,
    order.email,
    order.total,
    order.stripePaymentId || '',
    order.status,      // pending | paid | dispatched | delivered
    '',                // dispatchedAt
    '',                // deliveredAt
    order.supplierNotified ? 'yes' : 'no',
  ]);
}

// Simple wrapper used by referral.js
async function getSheet(tabName) {
  return {
    addRow: async (obj) => {
      await appendRow(tabName, Object.values(obj));
    },
    getRows: async () => {
      const rows = await getRows(tabName);
      return rows.map(r => ({
        get: (k) => r[k],
        set: (k, v) => { r[k] = v; },
        save: async () => { /* updated via updateRow */ },
      }));
    },
  };
}

module.exports = {
  appendRow, getRows, updateRow,
  logQuote, updateQuoteStatus,
  logReferralCode, getReferralCode, redeemReferralCode,
  logCustomer, logOrder,
  getSheet,
};
