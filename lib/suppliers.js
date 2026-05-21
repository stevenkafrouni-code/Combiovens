// lib/suppliers.js
// Supplier ordering rules, contacts, and templates
// Claude reads this to know HOW to place each supplier order

const SUPPLIERS = {

  simco: {
    name: 'Simco Group',
    brands: ['Atosa', 'CookRite', 'MixRite', 'Jasper'],
    contactName: 'Simco Sales Team',
    contactEmail: 'sales@simcogroup.com.au',
    contactPhone: '1300 SIMCO',
    website: 'https://simcogroup.com.au',
    orderMethod: 'email',   // email | portal | phone
    leadTimeDays: { standard: 3, custom: 10 },
    minimumOrder: null,
    paymentTerms: 'COD or account (apply separately)',
    deliveryNote: 'Ground floor delivery only. Advise if stairs or lift required. Tail-lift truck — ensure site access.',
    orderEmailTemplate: `
Subject: Purchase Order – CombiOvens.com.au – [ORDER_ID]

Hi Simco Team,

Please process the following order on our dealer account:

ORDER DETAILS
-------------
Order ID:     [ORDER_ID]
Date:         [DATE]
Delivery to:  [CUSTOMER_NAME] / [BUSINESS_NAME]
              [DELIVERY_ADDRESS]
              [SUBURB] [STATE] [POSTCODE]
Contact:      [CUSTOMER_PHONE]
Instructions: [DELIVERY_NOTES]

ITEMS
-----
[ITEM_LINES]

TOTAL (our cost): $[COST_TOTAL] ex GST

Please confirm availability and estimated dispatch date.

Thanks,
CombiOvens.com.au
sales@combiovens.com.au
    `.trim(),
    skuMapping: {
      // Some site SKUs differ from Simco's order SKUs
      // 'SITE_SKU': 'SIMCO_SKU'
    },
  },

  classeq: {
    name: 'Classeq Australia',
    brands: ['Classeq'],
    contactName: 'Classeq AU Sales',
    contactEmail: 'sales@classeq.com.au',
    contactPhone: null,
    website: 'https://www.classeq.com.au',
    orderMethod: 'email',
    leadTimeDays: { standard: 5, custom: 14 },
    minimumOrder: null,
    paymentTerms: 'Pro forma invoice',
    deliveryNote: 'Classeq machines require plumbing connection. Advise customer to have plumber ready on delivery day.',
    orderEmailTemplate: `
Subject: Dealer Order – CombiOvens.com.au – [ORDER_ID]

Hi Classeq Team,

Please process the following order:

ORDER ID:   [ORDER_ID]
DATE:       [DATE]

DELIVERY
--------
[CUSTOMER_NAME] / [BUSINESS_NAME]
[DELIVERY_ADDRESS]
[SUBURB] [STATE] [POSTCODE]
Phone: [CUSTOMER_PHONE]

ITEMS ORDERED
-------------
[ITEM_LINES]

Please advise lead time and send pro forma invoice to sales@combiovens.com.au.

Regards,
CombiOvens.com.au
    `.trim(),
    skuMapping: {},
  },

  winterhalter: {
    name: 'Winterhalter Australia',
    brands: ['Winterhalter'],
    contactName: 'Winterhalter AU',
    contactEmail: 'info@winterhalter.com.au',
    contactPhone: '1800 946 743',
    website: 'https://www.winterhalter.com/au-en/',
    orderMethod: 'email',
    leadTimeDays: { standard: 7, custom: 21 },
    minimumOrder: null,
    paymentTerms: 'Pro forma',
    deliveryNote: 'Winterhalter machines require professional installation. Advise customer — installation not included unless arranged separately.',
    orderEmailTemplate: `
Subject: Dealer Purchase Order – [ORDER_ID] – CombiOvens.com.au

Dear Winterhalter Team,

Please find below a purchase order from CombiOvens.com.au (authorised dealer):

ORDER REFERENCE: [ORDER_ID]
DATE: [DATE]

SHIP TO:
[CUSTOMER_NAME]
[BUSINESS_NAME]
[DELIVERY_ADDRESS], [SUBURB] [STATE] [POSTCODE]
Contact: [CUSTOMER_PHONE]

ORDER ITEMS:
[ITEM_LINES]

Please confirm stock availability, estimated delivery date, and send invoice to sales@combiovens.com.au.

Kind regards,
CombiOvens.com.au
    `.trim(),
    skuMapping: {
      'WH-UC-S': 'UC-S',
      'WH-UC-M': 'UC-M',
      'WH-UC-L': 'UC-L',
      'WH-UC-XL': 'UC-XL',
      'WH-UC-S-EXI': 'UC-S Excellence-i',
      'WH-UC-M-EXI': 'UC-M Excellence-i',
      'WH-PT-M': 'PT-M',
      'WH-PT-L': 'PT-L',
      'WH-PT-XL': 'PT-XL',
      'WH-GS630': 'GS 630',
      'WH-UF-XL': 'UF-XL',
    },
  },

};

// Given a SKU, return the correct supplier
function getSupplierForSku(sku) {
  const PRODUCTS = require('../data/products.json');
  const product = PRODUCTS.find(p => p.sku === sku);
  if (!product) return null;

  const brand = product.cat.split('·')[0].trim();

  for (const [key, supplier] of Object.entries(SUPPLIERS)) {
    if (supplier.brands.some(b => brand.toLowerCase().includes(b.toLowerCase()))) {
      return { key, ...supplier };
    }
  }
  return SUPPLIERS.simco; // default
}

// Group order items by supplier
function groupBySupplier(items) {
  const groups = {};
  for (const item of items) {
    const supplier = getSupplierForSku(item.sku);
    if (!supplier) continue;
    if (!groups[supplier.key]) {
      groups[supplier.key] = { supplier, items: [] };
    }
    groups[supplier.key].items.push(item);
  }
  return groups;
}

// Build a supplier order email from template
function buildOrderEmail(supplierKey, { orderId, date, customer, items }) {
  const supplier = SUPPLIERS[supplierKey];
  if (!supplier) throw new Error(`Unknown supplier: ${supplierKey}`);

  const PRODUCTS = require('../data/products.json');
  const { getCostPrice } = require('./products');

  let itemLines = '';
  let costTotal = 0;

  for (const item of items) {
    const product = PRODUCTS.find(p => p.sku === item.sku);
    const orderSku = supplier.skuMapping[item.sku] || item.sku;
    const cost = getCostPrice(product?.rrp);
    const lineTotal = cost ? cost * item.qty : null;
    if (lineTotal) costTotal += lineTotal;

    itemLines += `  ${orderSku} — ${product?.name || item.sku}\n`;
    itemLines += `  Qty: ${item.qty}  |  Unit cost: ${cost ? '$' + cost.toFixed(2) : 'TBC'}\n\n`;
  }

  const email = supplier.orderEmailTemplate
    .replace(/\[ORDER_ID\]/g, orderId)
    .replace(/\[DATE\]/g, date)
    .replace(/\[CUSTOMER_NAME\]/g, customer.name)
    .replace(/\[BUSINESS_NAME\]/g, customer.businessName || '')
    .replace(/\[DELIVERY_ADDRESS\]/g, customer.address || 'TBC')
    .replace(/\[SUBURB\]/g, customer.suburb || '')
    .replace(/\[STATE\]/g, customer.state || '')
    .replace(/\[POSTCODE\]/g, customer.postcode)
    .replace(/\[CUSTOMER_PHONE\]/g, customer.phone || '')
    .replace(/\[DELIVERY_NOTES\]/g, customer.deliveryNotes || 'Nil')
    .replace(/\[ITEM_LINES\]/g, itemLines.trim())
    .replace(/\[COST_TOTAL\]/g, costTotal.toFixed(2));

  return {
    to: supplier.contactEmail,
    subject: email.split('\n')[0].replace('Subject: ', ''),
    body: email.split('\n').slice(2).join('\n'),
    supplierName: supplier.name,
    deliveryNote: supplier.deliveryNote,
  };
}

module.exports = { SUPPLIERS, getSupplierForSku, groupBySupplier, buildOrderEmail };
