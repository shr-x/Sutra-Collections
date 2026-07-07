import fs from 'fs';
import { renderTailoringPdf } from '../lib/pdf/tailoring-template';

const company = {
  name: 'Sutra Collections',
  gstin: '29AABCS1234A1Z5',
  address: '12 MG Road, Bengaluru - 560001',
  phone: '+91 98765 43210',
};

const measurements = [
  { fieldName: 'Chest',    value: '42', unit: 'in' },
  { fieldName: 'Waist',    value: '36', unit: 'in' },
  { fieldName: 'Hip',      value: '44', unit: 'in' },
  { fieldName: 'Length',   value: '28', unit: 'in' },
  { fieldName: 'Shoulder', value: '17', unit: 'in' },
  { fieldName: 'Sleeve',   value: '24', unit: 'in' },
];

async function main() {
  const out = '/tmp/sutra-sample-pdfs';
  fs.mkdirSync(out, { recursive: true });

  // Customer PDF — single item
  fs.writeFileSync(`${out}/customer-single.pdf`, await renderTailoringPdf({
    docType: 'TAILORING ORDER',
    orderNumber: 'TO/2026-27/0001',
    orderDate:   '25 Jun 2026',
    dueDate:     '10 Jul 2026',
    company, customer: { name: 'Ananya Sharma', phone: '+91 98765 11111' },
    items: [{
      designName: 'Classic Silk Kurta', colorFabric: 'Royal Blue Silk',
      qty: 1, price: 4500,
      notes: 'Mandarin collar, side slits. Gold button trim on placket.',
      measurements,
    }],
    gstRate: 5,
  }));
  console.log('✓ customer-single.pdf');

  // Customer PDF — grouped
  fs.writeFileSync(`${out}/customer-grouped.pdf`, await renderTailoringPdf({
    docType: 'TAILORING ORDER',
    orderNumber: 'TO/2026-27/0002-GRP',
    orderDate:   '25 Jun 2026',
    dueDate:     '10 Jul 2026',
    company, customer: { name: 'Rajesh Kumar', phone: '+91 90000 22222' },
    items: [
      { designName: 'Bandhgala Suit',  colorFabric: 'Charcoal Wool',  qty: 1, price: 12000, notes: 'Notch lapel, 2 buttons.', measurements },
      { designName: 'Nehru Jacket',    colorFabric: 'Cream Linen',    qty: 1, price: 5500,  measurements: measurements.slice(0, 4) },
      { designName: 'Dress Shirt',     colorFabric: 'White Cotton',   qty: 2, price: 3200,  notes: 'French cuffs.', measurements: measurements.slice(0, 3) },
    ],
    gstRate: 12,
  }));
  console.log('✓ customer-grouped.pdf');

  // Tailor PDF — single item
  fs.writeFileSync(`${out}/tailor-single.pdf`, await renderTailoringPdf({
    docType: 'PRODUCTION ORDER',
    orderNumber: 'TO/2026-27/0001',
    orderDate:   '25 Jun 2026',
    dueDate:     '10 Jul 2026',
    company, customer: { name: 'Ananya Sharma', phone: '+91 98765 11111' },
    items: [{
      designName: 'Classic Silk Kurta', colorFabric: 'Royal Blue Silk',
      qty: 1, price: 4500,
      notes: 'Mandarin collar, side slits. Gold button trim on placket.',
      measurements,
    }],
  }));
  console.log('✓ tailor-single.pdf');

  // Tailor PDF — grouped
  fs.writeFileSync(`${out}/tailor-grouped.pdf`, await renderTailoringPdf({
    docType: 'PRODUCTION ORDER',
    orderNumber: 'TO/2026-27/0002-GRP',
    orderDate:   '25 Jun 2026',
    dueDate:     '10 Jul 2026',
    company, customer: { name: 'Rajesh Kumar', phone: '+91 90000 22222' },
    items: [
      { designName: 'Bandhgala Suit', colorFabric: 'Charcoal Wool', qty: 1, price: 12000, notes: 'Notch lapel, 2 buttons.', measurements },
      { designName: 'Nehru Jacket',   colorFabric: 'Cream Linen',   qty: 1, price: 5500,  measurements: measurements.slice(0, 4) },
      { designName: 'Dress Shirt',    colorFabric: 'White Cotton',  qty: 2, price: 3200,  notes: 'French cuffs.', measurements: measurements.slice(0, 3) },
    ],
  }));
  console.log('✓ tailor-grouped.pdf');

  console.log(`\nPDFs at ${out}/`);
}

main().catch(console.error);
