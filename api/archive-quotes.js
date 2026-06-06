// api/archive-quotes.js
// Monthly cron — moves quotes older than 90 days into data/quotes-archive.json
// Keeps data/quotes.json lean so reads stay fast
// Schedule: 0 3 1 * * (3am UTC on the 1st of each month) — see vercel.json

const { readFile, writeFile, appendToFile } = require('../lib/storage');

const ARCHIVE_AFTER_DAYS = 90;

module.exports = async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const hasSecret    = (req.headers['x-cron-secret'] || req.query.secret) === process.env.CRON_SECRET;
  const isLocalDev   = process.env.NODE_ENV === 'development';
  if (!isVercelCron && !hasSecret && !isLocalDev) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const quotes  = await readFile('data/quotes.json').catch(() => []);
    const cutoff  = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const toArchive = quotes.filter(q => q.timestamp && new Date(q.timestamp) < cutoff);
    const toKeep    = quotes.filter(q => !q.timestamp || new Date(q.timestamp) >= cutoff);

    if (!toArchive.length) {
      return res.status(200).json({ archived: 0, kept: toKeep.length, message: 'Nothing to archive' });
    }

    // Append old quotes to archive file, write trimmed active file
    const existing = await readFile('data/quotes-archive.json').catch(() => []);
    await writeFile('data/quotes-archive.json', [...existing, ...toArchive]);
    await writeFile('data/quotes.json', toKeep);

    console.log(`Archived ${toArchive.length} quotes, kept ${toKeep.length}`);
    return res.status(200).json({
      archived: toArchive.length,
      kept:     toKeep.length,
      oldestKept: toKeep[0]?.timestamp || null,
    });

  } catch (err) {
    console.error('Archive error:', err);
    return res.status(500).json({ error: err.message });
  }
};
