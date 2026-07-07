import fs from 'fs';
import { renderStickerSheet, type StickerCode } from '../lib/pdf/sticker-template';

const stickers: StickerCode[] = [
  { code: 'SC-0001', itemName: 'Silk Saree',       price: 4500,  sizeName: 'Free Size', colorName: 'Royal Blue', date: '25 Jun 2026' },
  { code: 'SC-0002', itemName: 'Cotton Kurta',      price: 1200,  sizeName: 'M',         colorName: 'White',      date: '25 Jun 2026' },
  { code: 'SC-0003', itemName: 'Lehenga Choli',     price: 8500,  sizeName: 'L',         colorName: 'Red',        date: '25 Jun 2026' },
  { code: 'SC-0004', itemName: 'Bandhgala Jacket',  price: 6000,  sizeName: 'XL',        colorName: 'Charcoal',   date: '25 Jun 2026' },
  { code: 'BP-0016', itemName: 'Embroidered Blouse', price: 850,  sizeName: 'Regular',   colorName: 'Default',    date: '25 Jun 2026' },
];

async function main() {
  const out = '/tmp/sutra-sample-stickers';
  fs.mkdirSync(out, { recursive: true });

  for (const [size, label] of [['s20','20x20'], ['s25','25x25'], ['h40','40x60'], ['h50','50x75']] as const) {
    const buf = await renderStickerSheet(stickers, size);
    fs.writeFileSync(`${out}/stickers-${label}.pdf`, buf);
    console.log(`✓ stickers-${label}.pdf`);
  }

  // Custom size
  const buf = await renderStickerSheet(stickers, 'custom', undefined, 35, 55);
  fs.writeFileSync(`${out}/stickers-custom-35x55.pdf`, buf);
  console.log('✓ stickers-custom-35x55.pdf');

  console.log(`\nPDFs at ${out}/`);
}

main().catch(console.error);
