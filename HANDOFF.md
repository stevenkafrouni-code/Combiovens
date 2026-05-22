# CombiOvens.com.au — Project Handoff (Session 2)

## Live Site
- **URL**: https://www.combiovens.com.au
- **Vercel Project**: `combiovens-live`
- **GitHub**: https://github.com/stevenkafrouni-code/Combiovens
- **Local repo**: `~/Downloads/combiovens`
- **Owner**: Steven Kafrouni — steven@misspickle.com.au

---

## Tech Stack
- **Frontend**: Single HTML file — `public/index.html`
- **Backend**: Vercel Serverless Functions (Node.js)
- **Email**: Resend API
- **AI**: Anthropic Claude API (`claude-haiku-4-5-20251001`)
- **Payments**: Stripe (not yet live — awaiting ABN)
- **Storage**: GitHub JSON files (`data/quotes.json`, `data/orders.json`, etc.)
- **DNS**: GoDaddy → Vercel

---

## Vercel Environment Variables (all confirmed working)
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` — `claude-haiku-4-5-20251001`
- `RESEND_API_KEY`
- `ADMIN_EMAIL` — `steven@misspickle.com.au`
- `FROM_EMAIL` — `onboarding@resend.dev` (temporary — switching to sales@combiovens.com.au once Resend domain verified)
- `ADMIN_PASSWORD` — `Hospo2026!`
- `GITHUB_TOKEN`
- `GITHUB_REPO` — `stevenkafrouni-code/Combiovens`

---

## File Structure
```
combiovens/
├── api/
│   ├── quote.js          — POST /api/quote — receives quote form, emails admin for approval
│   ├── approve.js        — GET /api/approve?quoteId=&pw=&data= — admin approves, sends to customer
│   ├── reject.js         — GET /api/reject?quoteId=&pw= — admin rejects
│   ├── webhook.js        — POST /api/webhook — Stripe payment events
│   └── validate-referral.js
├── lib/
│   ├── claude.js         — Anthropic integration
│   ├── email.js          — All email templates via Resend
│   ├── products.js       — Pricing engine
│   ├── referral.js       — Referral code generation/validation
│   ├── storage.js        — GitHub JSON file storage (created session 2)
│   ├── sheets.js         — STUBBED OUT (empty, replaced by storage.js)
│   └── suppliers.js      — Supplier order templates
├── data/
│   ├── products.json     — 58 products with full pricing
│   ├── pricing.json      — 197 SKUs with RRP/cost/sell prices
│   ├── quotes.json       — Live quote storage
│   ├── orders.json
│   ├── referrals.json
│   └── customers.json
├── public/
│   └── index.html        — Full website (58 products, search, filters, quote form)
├── package.json
├── vercel.json
└── SETUP.md
```

---

## Pricing Logic
- **Simco brands** (Atosa, CookRite, Jasper, MixRite): RRP × 0.65 = sell price, RRP × 0.60 = cost
- **Classeq/Winterhalter**: POA — dealer margin not yet confirmed
- **Referral discount**: $250 flat off order total
- **GST**: 10% added on top
- Pricing data lives in `data/pricing.json` — each SKU has `rrp`, `cost`, `sell`, `margin`, `margin_pct`

---

## Current Quote Flow (as of Session 2)
1. ✅ Customer submits quote form on website
2. ✅ `POST /api/quote` — validates, Claude reviews, emails admin for approval
3. ✅ Admin gets approval email at steven@misspickle.com.au
4. ✅ Admin clicks Approve → sends quote to customer
5. ✅ Customer receives quote email with: RRP (strikethrough), Our Price, discount %, Saving, Total, GST breakdown

**NOTE**: The approval step (items 2-4) needs to be REMOVED — quotes should go straight to the customer. See punch list item #1.

---

## What Was Fixed in Session 2
1. Created `lib/storage.js` — was missing, causing approve.js to crash
2. Added `updateQuote()` function to storage.js
3. Fixed `customerName.split()` crash in email.js — field was undefined
4. Added RRP, discount %, and Saving columns to customer quote email
5. Fixed Quote Reference box visibility (was white text on white background in light email clients)

---

## FULL PUNCH LIST

### 🔥 Do First
1. **Remove approval step** — `api/quote.js` should call `sendQuoteToCustomer()` directly after Claude review, skip the admin approval email and `approve.js` entirely
2. **Quote cart/basket** — Customer adds multiple products to a cart before hitting the quote form. Like a traditional ecom shop. Currently one product goes straight to the form.
3. **Product search** — Working search bar to find products by name, SKU, or category
4. **BCC admin on every customer quote email** — steven@misspickle.com.au should be BCC'd on every outgoing quote
5. **Remove "Accept Quote & Pay" button** from customer quote email — Stripe not live yet, button goes nowhere
6. **Delivery line** — Add "Freight: TBC — confirmed within 24hrs" as a line item on every quote
7. **Mobile hero text** — Too large on iPhone, needs reducing

### 📧 Email
8. Switch `FROM_EMAIL` from `onboarding@resend.dev` to `sales@combiovens.com.au` once Resend domain verified
9. Show product dimensions in customer quote email (dims field exists on line objects)

### 🛒 Frontend
10. Authorised dealer badges on product cards and popups
11. Confirm search bar is visible and working on live site

### 💰 Payments (blocked on business setup)
12. Stripe activation — needs ABN + bank account
13. PayPal via Stripe dashboard
14. EFT — "Mark as Paid" button triggers post-payment automation
15. Stripe payment link generated on quote approval

### 📊 Analytics & Admin
16. Enable Vercel Analytics (one click in Vercel dashboard)
17. Daily summary email — traffic + quotes + orders + revenue

### ⚖️ Legal Pages
18. Privacy Policy page
19. Terms of Sale page
20. Warranty page

### 📞 Contact
21. Replace placeholder `1300 000 000` with real Optus Loop number once set up

### 🏢 Business Setup (Steven to action)
22. Register business entity (sole trader or Pty Ltd)
23. Get ABN
24. Open business bank account
25. Complete Stripe activation with ABN + bank details
26. Enable PayPal via Stripe

### 🌐 Domain & SSL
27. SSL for root `combiovens.com.au` — Vercel handling automatically (was "pending" last check)
28. Resend domain verification for `combiovens.com.au` (started, was "Pending")

### 🚀 Post-Launch
29. Google Business Profile setup
30. Google review follow-up email after delivery
31. First Facebook hospo group post (when quote flow is clean)

---

## Referral System (built, not yet tested end-to-end)
- $250 flat discount on order total
- Referral codes in `data/referrals.json`
- Validation via `POST /api/validate-referral`
- Voucher issued post-payment, 6 month expiry, transferable

---

## Suppliers
- **Simco Group** (Atosa, CookRite, MixRite, Jasper) — freight rates by state TBC (call Simco)
- **Classeq** — dealer margin TBC
- **Winterhalter** — dealer margin TBC
- Supplier order templates in `lib/suppliers.js`

---

## Business Context
- Authorised dealer: Atosa, CookRite, MixRite, Jasper (via Simco), Classeq, Winterhalter
- Online only — no showroom
- Target: hospo operators, chefs, venue owners across Australia
- Email: sales@combiovens.com.au → forwarding to steven@misspickle.com.au
- Phone: placeholder 1300 000 000 (Optus Loop being set up)

---

## How to Start Next Session (Claude Code)
1. Open Claude Code desktop app
2. Click "Select folder" → select `~/Downloads/combiovens`
3. Say: "Read HANDOFF.md and continue the CombiOvens build. Start with punch list item #1 — remove the approval step so quotes go straight to the customer."
