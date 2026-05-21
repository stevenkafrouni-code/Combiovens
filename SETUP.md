# CombiOvens.com.au — Backend Setup Guide

## Architecture
- **Frontend**: Static HTML (combiovens_website_v3.html) → served from Vercel
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Google Sheets (4 tabs)
- **Email**: Resend API
- **Payments**: Stripe
- **AI**: Anthropic Claude API
- **Referral**: Custom code system, stored in Google Sheets

---

## 1. Environment Variables
Set these in Vercel Dashboard → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
GOOGLE_SHEETS_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_SERVICE_ACCOUNT_EMAIL=combiovens@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
ADMIN_EMAIL=sales@combiovens.com.au
FROM_EMAIL=sales@combiovens.com.au
```

---

## 2. Google Sheets Setup

Create a new Google Sheet. Add these 4 tabs with these exact column headers:

### Tab: Quotes
```
QuoteId | Timestamp | CustomerName | BusinessName | Email | Phone | Postcode | Items | Subtotal | Discount | Total | ReferralCode | Status | ApprovedAt | PaymentLink | PaidAt | StripePaymentId | DeliveryNotes | Notes
```

### Tab: Orders
```
OrderId | QuoteId | Timestamp | CustomerName | Email | Total | StripePaymentId | Status | DispatchedAt | DeliveredAt | SupplierNotified
```

### Tab: Referral_Codes
```
Code | IssuedTo | IssuedEmail | OrderId | IssuedDate | ExpiryDate | Status | RedeemedBy | RedeemedEmail | RedeemedDate | RedeemedOrderId
```

### Tab: Customers
```
Email | Name | BusinessName | Phone | Postcode | FirstOrderDate | OrderCount
```

---

## 3. Google Service Account

1. Go to console.cloud.google.com
2. Create a new project: "combiovens"
3. Enable the Google Sheets API
4. Create a Service Account
5. Download the JSON key file
6. Copy `client_email` → GOOGLE_SERVICE_ACCOUNT_EMAIL
7. Copy `private_key` → GOOGLE_PRIVATE_KEY
8. Share your Google Sheet with the service account email (Editor access)

---

## 4. Resend Setup

1. Sign up at resend.com
2. Add domain: combiovens.com.au
3. Add DNS records to GoDaddy (Resend will give you the exact records)
4. Verify domain
5. Create API key → RESEND_API_KEY

---

## 5. Stripe Setup

1. Complete Stripe account setup with ABN and bank details
2. Get Secret Key → STRIPE_SECRET_KEY
3. Add webhook endpoint: https://combiovens.com.au/api/webhook
4. Select events: checkout.session.completed, payment_intent.payment_failed
5. Get Webhook Secret → STRIPE_WEBHOOK_SECRET
6. Enable PayPal in Stripe Dashboard → Payment Methods

---

## 6. Deploy to Vercel

```bash
# In your project root
npm install
vercel --prod
```

Point your GoDaddy domain to Vercel:
- In GoDaddy: DNS → Add CNAME record: www → cname.vercel-dns.com
- In GoDaddy: Add A record: @ → 76.76.19.61
- In Vercel: Add domain combiovens.com.au

---

## 7. Update Frontend

In combiovens_website_v3.html, update the quote form submission to POST to:
```
https://combiovens.com.au/api/quote
```

And referral code validation to POST to:
```
https://combiovens.com.au/api/validate-referral
```

---

## 8. Things Still Needed

- [ ] Your ABN — add to email footer in lib/email.js (search: [YOUR_ABN])
- [ ] Real phone number — update PHONE in lib/email.js when Optus Loop is live
- [ ] Supplier contact details — confirm emails for Simco, Classeq, Winterhalter in lib/suppliers.js
- [ ] Stripe account activation (needs business entity)
- [ ] Resend domain verification in GoDaddy
- [ ] Google Sheet created and shared with service account

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/quote | Submit quote form |
| POST | /api/validate-referral | Check referral code |
| GET | /api/approve/[quoteId] | Admin approves quote |
| GET | /api/reject/[quoteId] | Admin rejects quote |
| POST | /api/webhook | Stripe payment events |

---

## The Full Flow

1. Customer browses → adds items → submits quote form
2. `POST /api/quote` → validates → Claude reviews → logs to Sheets → emails admin
3. Admin clicks "Approve" in email
4. `GET /api/approve/[id]` → creates Stripe payment link → emails customer
5. Customer pays via Stripe
6. Stripe fires `checkout.session.completed` webhook
7. `POST /api/webhook` →
   - Logs order
   - Redeems referral code (if used)
   - Notifies referrer
   - Issues new referral code for this customer
   - Claude writes supplier order emails
   - Sends supplier orders
   - Sends confirmation + voucher to customer
   - Notifies admin
