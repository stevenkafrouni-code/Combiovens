// api/follow-up-cron.js
// Daily cron — sends timed follow-ups on quotes that are still open
// Schedule: 21:00 UTC daily (7am AEST) — see vercel.json
//
// Rules:
//   - Only process status === 'sent' (skip paid / replied / closed)
//   - Skip any quote with hasPoaItems (shouldn't exist after POA block, safety net)
//   - Skip if quote has no email
//   - Send day 2, 4, or 7 follow-up if that day hasn't been sent yet
//   - Append to followUpsSent after each send — idempotent, safe to re-run
//   - Expiry = timestamp + 14 days (never hardcoded)
//   - After day 7, no further automated emails — sequence ends

const { readFile, updateQuote } = require('../lib/storage');
const { sendFollowUp }          = require('../lib/email');

const FOLLOW_UP_DAYS = [2, 4, 7];

module.exports = async (req, res) => {
  // Auth: Vercel cron sets x-vercel-cron:1. Also accept manual trigger with secret.
  const isVercelCron   = req.headers['x-vercel-cron'] === '1';
  const hasSecret      = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
  const isLocalDev     = process.env.NODE_ENV === 'development';

  if (!isVercelCron && !hasSecret && !isLocalDev) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let quotes;
  try {
    quotes = await readFile('data/quotes.json');
  } catch (err) {
    return res.status(500).json({ error: 'Could not read quotes: ' + err.message });
  }

  const now = new Date();
  const results = { sent: [], skipped: [], errors: [] };

  for (const quote of quotes) {
    // ── Skip non-actionable quotes ───────────────────────────────────────────
    if (quote.status !== 'sent') {
      results.skipped.push({ quoteId: quote.quoteId, reason: `status:${quote.status}` });
      continue;
    }
    if (quote.hasPoaItems) {
      results.skipped.push({ quoteId: quote.quoteId, reason: 'has_poa_items' });
      continue;
    }
    if (!quote.email) {
      results.skipped.push({ quoteId: quote.quoteId, reason: 'no_email' });
      continue;
    }
    if (!quote.timestamp) {
      results.skipped.push({ quoteId: quote.quoteId, reason: 'no_timestamp' });
      continue;
    }

    // ── Check quote hasn't expired (14 days) ─────────────────────────────────
    const created = new Date(quote.timestamp);
    const daysSince = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (daysSince > 14) {
      results.skipped.push({ quoteId: quote.quoteId, reason: 'expired' });
      continue;
    }

    // ── Find ALL follow-up days due and not yet sent ─────────────────────────
    // Uses filter (not find) so a missed cron run catches up on next execution
    const sentDays = (quote.followUpsSent || []).map(f => f.day);
    const daysDue = FOLLOW_UP_DAYS.filter(d => daysSince >= d && !sentDays.includes(d));

    if (daysDue.length === 0) {
      results.skipped.push({ quoteId: quote.quoteId, reason: `no_day_due (day ${daysSince}, sent [${sentDays.join(',')}])` });
      continue;
    }

    // ── Send each due day and record ─────────────────────────────────────────
    const updatedFollowUps = [...(quote.followUpsSent || [])];
    for (const dayToSend of daysDue) {
      try {
        await sendFollowUp(quote, dayToSend);
        updatedFollowUps.push({ day: dayToSend, sentAt: now.toISOString() });
        results.sent.push({ quoteId: quote.quoteId, day: dayToSend, email: quote.email });
      } catch (err) {
        console.error(`Follow-up error for ${quote.quoteId} day ${dayToSend}:`, err.message);
        results.errors.push({ quoteId: quote.quoteId, day: dayToSend, error: err.message });
      }
    }
    await updateQuote(quote.quoteId, { followUpsSent: updatedFollowUps });
  }

  console.log('Follow-up cron complete:', results);
  return res.status(200).json({
    ran:     now.toISOString(),
    sent:    results.sent.length,
    skipped: results.skipped.length,
    errors:  results.errors.length,
    detail:  results,
  });
};
