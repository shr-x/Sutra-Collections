'use client';

import ImportWizard, { type ImportColumn, type SaveResult } from '@/components/import-wizard';

const COLUMNS: ImportColumn[] = [
  { key: 'name',         label: 'Name',         type: 'text',   required: true },
  { key: 'phone',        label: 'Phone',         type: 'text' },
  { key: 'gstin',        label: 'GSTIN',         type: 'text' },
  { key: 'address',      label: 'Address',       type: 'text' },
  { key: 'credit_limit', label: 'Credit Limit ₹', type: 'number' },
];

async function handleSave(rows: Record<string, string>[]): Promise<SaveResult> {
  const res  = await fetch('/api/import/customers/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const json = await res.json() as SaveResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Save failed');
  return json;
}

export default function CustomersImportForm() {
  return (
    <ImportWizard
      module="customers"
      columns={COLUMNS}
      title="Import Customers"
      backHref="/customers"
      onSave={handleSave}
    />
  );
}
