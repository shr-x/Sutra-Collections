'use client';

import ImportWizard, { type ImportColumn, type SaveResult } from '@/components/import-wizard';

const COLUMNS: ImportColumn[] = [
  { key: 'name',    label: 'Name',    type: 'text', required: true },
  { key: 'phone',   label: 'Phone',   type: 'text' },
  { key: 'gstin',   label: 'GSTIN',   type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
];

async function handleSave(rows: Record<string, string>[]): Promise<SaveResult> {
  const res  = await fetch('/api/import/suppliers/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const json = await res.json() as SaveResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Save failed');
  return json;
}

export default function SuppliersImportForm() {
  return (
    <ImportWizard
      module="suppliers"
      columns={COLUMNS}
      title="Import Suppliers"
      backHref="/suppliers"
      onSave={handleSave}
    />
  );
}
