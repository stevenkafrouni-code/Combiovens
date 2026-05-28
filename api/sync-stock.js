// api/sync-stock.js
// Daily cron: log into Simco dealer portal, download stock CSV, save to data/stock.json
// Called by Vercel cron at 6:00 AM AEST (20:00 UTC) — Simco updates stock overnight
// Also callable manually: GET /api/sync-stock?secret=CRON_SECRET

const { writeFile } = require('../lib/storage');

const SIMCO_BASE = 'https://simcogroup.com.au';

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function extractCookies(response) {
  try {
    // Node 18 built-in fetch
    if (typeof response.headers.getSetCookie === 'function') {
      return response.headers.getSetCookie().map(c => c.split(';')[0]);
    }
    // Fallback
    const raw = response.headers.get('set-cookie') || '';
    return raw ? [raw.split(';')[0]] : [];
  } catch {
    return [];
  }
}

function mergeCookies(existing, incoming) {
  const map = {};
  [...existing, ...incoming].forEach(c => {
    const key = c.split('=')[0].trim();
    if (key) map[key] = c;
  });
  return Object.values(map);
}

// ── Simple CSV parser (handles quoted fields) ──────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseStockCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n').filter(Boolean);
  if (lines.length < 2) throw new Error('CSV too short — login may have failed');
  const headers = parseCSVLine(lines[0]);
  const skuIdx = headers.indexOf('SKU');
  const sydIdx = headers.indexOf('SYD');
  const perIdx = headers.indexOf('PER');
  if (skuIdx === -1) throw new Error('SKU column not found in CSV — unexpected format');

  const stock = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const sku  = cols[skuIdx];
    if (!sku) continue;
    stock[sku] = {
      syd: cols[sydIdx] || 'Unknown',
      per: cols[perIdx] || 'Unknown',
      available: cols[sydIdx] === 'In Stock' || cols[perIdx] === 'In Stock',
    };
  }
  return stock;
}

// ── Main handler ───────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // Auth
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  try {
    const email    = process.env.SIMCO_EMAIL;
    const password = process.env.SIMCO_PASSWORD;
    if (!email || !password) throw new Error('SIMCO_EMAIL or SIMCO_PASSWORD env var not set');

    // ── Step 1: GET login page for form_key ──────────────────────────────────
    log.push('Fetching login page...');
    const loginPageRes = await fetch(`${SIMCO_BASE}/customer/account/login/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CombiOvens/1.0)' },
    });
    if (!loginPageRes.ok) throw new Error(`Login page returned ${loginPageRes.status}`);
    let cookies = extractCookies(loginPageRes);
    const loginHtml = await loginPageRes.text();

    const formKeyMatch = loginHtml.match(/name="form_key"\s+value="([^"]+)"/);
    if (!formKeyMatch) throw new Error('Could not find form_key on Simco login page');
    const formKey = formKeyMatch[1];
    log.push(`Got form_key: ${formKey.slice(0, 8)}...`);

    // ── Step 2: POST login ───────────────────────────────────────────────────
    log.push('Logging in...');
    const loginBody = new URLSearchParams({
      form_key:          formKey,
      'login[username]': email,
      'login[password]': password,
      send:              '',
    });

    const loginRes = await fetch(`${SIMCO_BASE}/customer/account/loginPost/`, {
      method:   'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie':       cookies.join('; '),
        'User-Agent':   'Mozilla/5.0 (compatible; CombiOvens/1.0)',
        'Referer':      `${SIMCO_BASE}/customer/account/login/`,
      },
      body: loginBody.toString(),
    });
    cookies = mergeCookies(cookies, extractCookies(loginRes));
    log.push(`Login response: ${loginRes.status}`);

    // Follow redirect if needed
    const redirectUrl = loginRes.headers.get('location');
    if (redirectUrl) {
      const afterRedirect = await fetch(redirectUrl.startsWith('http') ? redirectUrl : `${SIMCO_BASE}${redirectUrl}`, {
        headers: { 'Cookie': cookies.join('; '), 'User-Agent': 'Mozilla/5.0 (compatible; CombiOvens/1.0)' },
      });
      cookies = mergeCookies(cookies, extractCookies(afterRedirect));
    }

    // ── Step 3: GET account page, find stock download link ───────────────────
    log.push('Loading account page...');
    const accountRes = await fetch(`${SIMCO_BASE}/customer/account/`, {
      headers: { 'Cookie': cookies.join('; '), 'User-Agent': 'Mozilla/5.0 (compatible; CombiOvens/1.0)' },
    });
    cookies = mergeCookies(cookies, extractCookies(accountRes));
    const accountHtml = await accountRes.text();

    // Look for the Download Daily StockInfo button/link
    const stockLinkMatch =
      accountHtml.match(/href="([^"]*(?:stock|Stock)[^"]*)"/i) ||
      accountHtml.match(/href="([^"]*(?:daily|Daily)[^"]*)"/i);
    if (!stockLinkMatch) throw new Error('Could not find stock download link on account page — login may have failed');
    const stockUrl = stockLinkMatch[1].startsWith('http')
      ? stockLinkMatch[1]
      : `${SIMCO_BASE}${stockLinkMatch[1]}`;
    log.push(`Found stock URL: ${stockUrl}`);

    // ── Step 4: Download CSV ─────────────────────────────────────────────────
    log.push('Downloading stock CSV...');
    const csvRes = await fetch(stockUrl, {
      headers: { 'Cookie': cookies.join('; '), 'User-Agent': 'Mozilla/5.0 (compatible; CombiOvens/1.0)' },
    });
    if (!csvRes.ok) throw new Error(`CSV download failed with status ${csvRes.status}`);
    const csvText = await csvRes.text();
    if (!csvText.includes('SKU')) throw new Error('Downloaded file does not look like a stock CSV');
    log.push(`Downloaded ${csvText.split('\n').length} lines`);

    // ── Step 5: Parse ────────────────────────────────────────────────────────
    const stock = parseStockCSV(csvText);
    const count = Object.keys(stock).length;
    log.push(`Parsed ${count} SKUs`);

    // ── Step 6: Save to GitHub ───────────────────────────────────────────────
    log.push('Saving to GitHub...');
    await writeFile('data/stock.json', {
      lastUpdated: new Date().toISOString(),
      source:      'simcogroup.com.au',
      count,
      stock,
    });

    log.push('Done ✓');
    return res.json({ success: true, count, lastUpdated: new Date().toISOString(), log });

  } catch (err) {
    console.error('[sync-stock]', err.message);
    return res.status(500).json({ error: err.message, log });
  }
};
