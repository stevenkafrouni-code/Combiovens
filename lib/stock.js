// lib/stock.js
// Stock availability checker — reads from data/stock.json (synced daily from Simco)

const { readFile } = require('./storage');

let _cache = null;
let _cacheAt = 0;
const TTL = 4 * 60 * 60 * 1000; // 4 hours — refresh at most every 4hrs per cold start

async function getStock() {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache;
  try {
    const data = await readFile('data/stock.json');
    _cache = data.stock || {};
    _cacheAt = Date.now();
    return _cache;
  } catch {
    return {};
  }
}

async function checkStock(sku) {
  const stock = await getStock();
  const s = stock[sku];
  if (!s) return { syd: 'Unknown', per: 'Unknown', available: null, status: 'unknown' };
  const inSyd = s.syd === 'In Stock';
  const inPer = s.per === 'In Stock';
  const status = (!inSyd && !inPer) ? 'out' : (inSyd && inPer) ? 'both' : 'partial';
  return { syd: s.syd, per: s.per, available: inSyd || inPer, status };
}

async function enrichLinesWithStock(lines) {
  const stock = await getStock();
  return lines.map(l => {
    const s = stock[l.sku];
    if (!s) return { ...l, stock: { syd: 'Unknown', per: 'Unknown', available: null, status: 'unknown' } };
    const inSyd = s.syd === 'In Stock';
    const inPer = s.per === 'In Stock';
    const status = (!inSyd && !inPer) ? 'out' : (inSyd && inPer) ? 'both' : 'partial';
    return { ...l, stock: { syd: s.syd, per: s.per, available: inSyd || inPer, status } };
  });
}

module.exports = { checkStock, getStock, enrichLinesWithStock };
