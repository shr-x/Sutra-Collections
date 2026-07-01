/** Auto-generate a SKU from item name + color + size. Format: INITIALS-CLR-SZ */
export function generateSKU(itemName: string, color: string, size: string): string {
  const code = itemName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 4);
  const c = color.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const s = size.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return [code, c, s].filter(Boolean).join('-');
}
