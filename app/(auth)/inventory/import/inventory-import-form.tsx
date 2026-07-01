'use client';

import ImportWizard, { type ImportColumn, type SaveResult } from '@/components/import-wizard';

const COLUMNS: ImportColumn[] = [
  { key: 'name',     label: 'Item Name', type: 'text', required: true },
  { key: 'category', label: 'Category',  type: 'text' },
  { key: 'hsn_code', label: 'HSN Code',  type: 'text' },
  { key: 'gst_rate', label: 'GST %',     type: 'select', options: ['0', '5', '12', '18', '28'] },
  { key: 'unit',     label: 'Unit',      type: 'text' },
  { key: 'sizes',    label: 'Sizes',     type: 'text' },   // comma-separated, e.g. "S, M, L"
  { key: 'colors',   label: 'Colours',   type: 'text' },   // comma-separated, e.g. "Red, Blue"
];

interface Props {
  warehouseId: string | null;
  warehouses: { id: string; name: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function InventoryImportForm({ warehouseId, warehouses }: Props) {
  // Stock now comes from purchases only — imports create products (no opening qty).
  async function handleSave(rows: Record<string, string>[]): Promise<SaveResult> {
    const res  = await fetch('/api/import/inventory/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const json = await res.json() as SaveResult & { error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Save failed');
    return json;
  }

  return (
    <ImportWizard
      module="inventory"
      columns={COLUMNS}
      title="Import Inventory"
      backHref="/inventory/items"
      onSave={handleSave}
    />
  );
}
