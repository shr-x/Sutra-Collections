'use client';

import { useState, useCallback } from 'react';
import DatePicker from '@/components/date-picker';
import Link from 'next/link';

interface ExtractedItem {
  name: string;
  quantity: string;
  rate: string;
  gst_rate: string;
}

interface ExtractedBilling {
  type: 'purchase' | 'sales';
  party_name: string;
  invoice_date: string;
  items: ExtractedItem[];
}

interface Props {
  warehouses: { id: string; name: string }[];
  defaultWarehouseId: string | null;
}

type Step = 'upload' | 'processing' | 'preview' | 'saving' | 'done' | 'error';

const GST_OPTIONS = ['0', '5', '12', '18', '28'];

export default function BillingImportForm({ warehouses, defaultWarehouseId }: Props) {
  const [step, setStep]           = useState<Step>('upload');
  const [data, setData]           = useState<ExtractedBilling | null>(null);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? '');
  const [errorMsg, setErrorMsg]   = useState('');
  const [dragging, setDragging]   = useState(false);
  const [savedInvoiceType, setSavedInvoiceType] = useState<'purchase' | 'sales'>('purchase');

  const processFile = useCallback(async (file: File) => {
    setStep('processing');
    setErrorMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/import/billing', { method: 'POST', body: form });
      const json = await res.json() as ExtractedBilling & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Server error ${res.status}`);
      setData({
        type:         json.type ?? 'purchase',
        party_name:   json.party_name ?? '',
        invoice_date: json.invoice_date ?? new Date().toISOString().split('T')[0],
        items:        (json.items ?? []).map((it) => ({
          name:     it.name     ?? '',
          quantity: it.quantity ?? '1',
          rate:     it.rate     ?? '0',
          gst_rate: it.gst_rate ?? '12',
        })),
      });
      setStep('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const reset = () => { setStep('upload'); setData(null); setErrorMsg(''); };

  const updateHeader = <K extends keyof ExtractedBilling>(key: K, val: ExtractedBilling[K]) => {
    setData((d) => d ? { ...d, [key]: val } : d);
  };

  const updateItem = (idx: number, key: keyof ExtractedItem, val: string) => {
    setData((d) => {
      if (!d) return d;
      const items = [...d.items];
      items[idx] = { ...items[idx], [key]: val };
      return { ...d, items };
    });
  };

  const deleteItem = (idx: number) => {
    setData((d) => d ? { ...d, items: d.items.filter((_, i) => i !== idx) } : d);
  };

  const addItem = () => {
    setData((d) => d ? {
      ...d,
      items: [...d.items, { name: '', quantity: '1', rate: '0', gst_rate: '12' }],
    } : d);
  };

  const handleSave = async () => {
    if (!data || !warehouseId) return;
    setStep('saving');
    try {
      const res  = await fetch('/api/import/billing/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, warehouse_id: warehouseId }),
      });
      const json = await res.json() as { saved?: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? 'Save failed');
      setSavedInvoiceType(data.type);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      setStep('error');
    }
  };

  // ── Upload ──────────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-14 text-center transition-colors ${
            dragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-gray-50 hover:border-purple-400'
          }`}
        >
          <div className="text-5xl mb-4">🧾</div>
          <p className="text-lg font-medium text-gray-700 mb-1">Drag &amp; drop an invoice here</p>
          <p className="text-sm text-gray-400 mb-6">PDF, image (JPG/PNG), Excel (.xlsx), or CSV</p>
          <label className="btn-primary cursor-pointer">
            Browse File
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
            />
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-700">
            <strong>Gemini AI</strong> will extract the invoice header (supplier/customer, date) and all
            line items. A <strong>draft</strong> invoice is created — review it before finalizing.
          </p>
        </div>
      </div>
    );
  }

  // ── Processing ──────────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="text-5xl mb-5 animate-bounce">✨</div>
        <p className="text-lg font-semibold text-gray-700">Gemini is reading the invoice…</p>
        <p className="mt-1 text-sm text-gray-400">This usually takes 5–20 seconds</p>
        <div className="mt-6 h-1.5 w-52 mx-auto overflow-hidden rounded-full bg-gray-200">
          <div className="h-full animate-pulse bg-purple-500 rounded-full" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="max-w-xl mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="font-semibold text-red-700 mb-2">Something went wrong</p>
          <p className="text-sm text-red-600 font-mono break-all">{errorMsg}</p>
          <button onClick={reset} className="btn-secondary mt-6">Try Again</button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === 'done') {
    const backHref = savedInvoiceType === 'purchase' ? '/billing/purchases' : '/billing/invoices';
    return (
      <div className="max-w-lg mx-auto text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Draft Invoice Created</h2>
        <p className="text-sm text-gray-500 mb-8">
          Review and finalize it from the {savedInvoiceType === 'purchase' ? 'Purchases' : 'Invoices'} list.
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={reset} className="btn-secondary">Import Another</button>
          <Link href={backHref} className="btn-primary">View Invoices →</Link>
        </div>
      </div>
    );
  }

  // ── Preview / Saving ─────────────────────────────────────────────────────────
  if (!data) return null;
  const isSaving = step === 'saving';

  const totals = data.items.reduce((acc, it) => {
    const qty     = parseFloat(it.quantity) || 0;
    const rate    = parseFloat(it.rate)     || 0;
    const gstRate = parseFloat(it.gst_rate) || 0;
    const taxable = qty * rate;
    const tax     = taxable * gstRate / 100;
    return { taxable: acc.taxable + taxable, tax: acc.tax + tax };
  }, { taxable: 0, tax: 0 });

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Invoice Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Type</label>
            <select
              value={data.type}
              disabled={isSaving}
              onChange={(e) => updateHeader('type', e.target.value as 'purchase' | 'sales')}
              className="input"
            >
              <option value="purchase">Purchase</option>
              <option value="sales">Sales</option>
            </select>
          </div>
          <div className="col-span-1 md:col-span-1">
            <label className="label">{data.type === 'purchase' ? 'Supplier' : 'Customer'}</label>
            <input
              type="text"
              value={data.party_name}
              disabled={isSaving}
              onChange={(e) => updateHeader('party_name', e.target.value)}
              className="input"
              placeholder="Party name"
            />
          </div>
          <div>
            <label className="label">Invoice Date</label>
            <DatePicker
              value={data.invoice_date}
              onChange={(v) => updateHeader('invoice_date', v)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Warehouse</label>
            <select
              value={warehouseId}
              disabled={isSaving}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="input"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card p-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          <button onClick={addItem} disabled={isSaving} className="btn-secondary text-xs py-1">
            + Add Item
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-y">
              <tr>
                <th className="px-3 py-2 text-left w-8 text-gray-300">#</th>
                <th className="px-3 py-2 text-left">Item Name *</th>
                <th className="px-3 py-2 text-right w-24">Qty</th>
                <th className="px-3 py-2 text-right w-28">Rate ₹</th>
                <th className="px-3 py-2 text-right w-24">GST %</th>
                <th className="px-3 py-2 text-right w-32">Amount ₹</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((it, idx) => {
                const qty     = parseFloat(it.quantity) || 0;
                const rate    = parseFloat(it.rate)     || 0;
                const gstRate = parseFloat(it.gst_rate) || 0;
                const total   = qty * rate * (1 + gstRate / 100);

                return (
                  <tr key={idx} className="group hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-xs text-gray-300">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={it.name}
                        disabled={isSaving}
                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-purple-400 focus:outline-none min-w-[140px]"
                        placeholder="Item name"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={it.quantity}
                        disabled={isSaving}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-purple-400 focus:outline-none"
                        min="0"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={it.rate}
                        disabled={isSaving}
                        onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-purple-400 focus:outline-none"
                        min="0"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={it.gst_rate}
                        disabled={isSaving}
                        onChange={(e) => updateItem(idx, 'gst_rate', e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-purple-400 focus:outline-none"
                      >
                        {GST_OPTIONS.map((o) => <option key={o} value={o}>{o}%</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium text-gray-700">
                      ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => deleteItem(idx)}
                        disabled={isSaving}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs"
                      >✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t text-xs">
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-gray-500">Taxable:</td>
                <td className="px-3 py-2 text-right font-medium">
                  ₹{totals.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-1 text-right text-gray-500">GST:</td>
                <td className="px-3 py-1 text-right font-medium">
                  ₹{totals.tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
              <tr className="font-semibold text-gray-800">
                <td colSpan={5} className="px-4 py-2 text-right">Grand Total:</td>
                <td className="px-3 py-2 text-right">
                  ₹{(totals.taxable + totals.tax).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {data.items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">No items. Add rows manually or re-upload.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button onClick={reset} disabled={isSaving} className="btn-secondary">← Re-upload</button>
        <button
          onClick={handleSave}
          disabled={isSaving || !data.party_name.trim() || data.items.length === 0 || !warehouseId}
          className="btn-primary disabled:opacity-50"
        >
          {isSaving ? 'Creating Draft…' : 'Create Draft Invoice'}
        </button>
      </div>
    </div>
  );
}
