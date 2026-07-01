'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface AiImportItem {
  name: string;
  item_id: string | null;
  matched: boolean;
  quantity: number;
  rate: number;
  gst_rate: number;
  hsn_code: string | null;
  size: string | null;
  color: string | null;
}
export interface AiImportResult {
  supplier: {
    id: string | null;
    name: string;
    gstin: string | null;
    matched: boolean;
    matched_by?: 'gstin' | 'name' | null;
  };
  invoice_number: string | null;
  date: string | null;
  notes: string | null;
  items: AiImportItem[];
}

// sessionStorage key the New Purchase form reads on mount to prefill itself.
export const AI_PREFILL_KEY = 'purchase_ai_prefill';

const ACCEPT = '.pdf,.xlsx,.xls,.csv,.doc,.docx';

export default function PurchaseAiImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiImportResult | null>(null);

  // Add-supplier flow (#2)
  const [supplierSkipped, setSupplierSkipped] = useState(false);
  const [showSupModal, setShowSupModal] = useState(false);
  const [sName, setSName] = useState('');
  const [sGstin, setSGstin] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [savingSup, setSavingSup] = useState(false);
  const [supError, setSupError] = useState('');

  const reset = () => {
    setText(''); setFile(null); setError(''); setResult(null); setLoading(false);
    setSupplierSkipped(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const close = () => { setOpen(false); reset(); };

  const extract = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setSupplierSkipped(false);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        res = await fetch('/api/purchases/ai-import', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/purchases/ai-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Extraction failed'); return; }
      setResult(data as AiImportResult);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openSupplierModal = () => {
    if (!result) return;
    setSName(result.supplier.name);
    setSGstin(result.supplier.gstin ?? '');
    setSPhone('');
    setSAddress('');
    setSupError('');
    setShowSupModal(true);
  };

  const saveSupplier = async () => {
    if (!result) return;
    if (!sName.trim()) { setSupError('Name required'); return; }
    setSavingSup(true);
    setSupError('');
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sName.trim(), gstin: sGstin || null, phone: sPhone || '', address: sAddress || '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) { setSupError(data.error ?? 'Failed to save supplier'); return; }
      setResult({
        ...result,
        supplier: { id: data.id, name: sName.trim(), gstin: sGstin || null, matched: true, matched_by: 'name' },
      });
      setShowSupModal(false);
    } catch {
      setSupError('Network error');
    } finally {
      setSavingSup(false);
    }
  };

  const useData = () => {
    if (!result) return;
    sessionStorage.setItem(AI_PREFILL_KEY, JSON.stringify(result));
    router.push('/billing/purchases/new');
  };

  const matchedCount = result?.items.filter((i) => i.matched).length ?? 0;
  const unmatchedCount = result ? result.items.length - matchedCount : 0;
  const showSupplierCard = !!result && !result.supplier.matched && !!result.supplier.name && !supplierSkipped;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        ✨ AI Import
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="font-semibold text-gray-900">✨ AI Import — Purchase Invoice</h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {!result ? (
                <>
                  <p className="text-sm text-gray-500">
                    Upload a supplier bill (PDF, Excel, CSV, Word) or paste the text. Gemini will
                    extract the supplier, items, and totals to pre-fill a new purchase invoice.
                  </p>

                  {/* Option A: file upload */}
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary"
                    >
                      📎 Choose File
                    </button>
                    <p className="mt-2 text-xs text-gray-400">PDF, .xlsx, .xls, .csv, .doc, .docx</p>
                    {file && (
                      <p className="mt-2 text-sm text-purple-700">
                        Selected: <span className="font-medium">{file.name}</span>{' '}
                        <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-400 hover:text-red-500">✕</button>
                      </p>
                    )}
                  </div>

                  {/* Option B: paste text */}
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Or paste text</p>
                    <textarea
                      className="input h-36 w-full resize-none font-mono text-sm"
                      placeholder="Paste supplier invoice text here…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      disabled={!!file}
                    />
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={close} className="btn-secondary">Cancel</button>
                    <button
                      type="button"
                      onClick={extract}
                      disabled={loading || (!file && text.trim().length < 5)}
                      className="btn-primary"
                    >
                      {loading ? 'Extracting…' : 'Extract Data'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Preview */}
                  <div className="rounded-lg border border-gray-200 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Supplier</span>
                      <span className="font-medium">
                        {result.supplier.name || '—'}{' '}
                        {result.supplier.name && (
                          result.supplier.matched
                            ? <span className="text-green-600 text-xs">(matched by {result.supplier.matched_by === 'gstin' ? 'GSTIN' : 'name'})</span>
                            : <span className="text-amber-600 text-xs">(not found)</span>
                        )}
                      </span>
                    </div>
                    {result.supplier.gstin && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Supplier GSTIN</span>
                        <span className="font-mono text-xs">{result.supplier.gstin}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Invoice #</span>
                      <span>{result.invoice_number ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date</span>
                      <span>{result.date ?? '—'}</span>
                    </div>
                    {result.notes && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Notes</span>
                        <span className="text-right">{result.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Supplier not found → suggest adding (#2) */}
                  {showSupplierCard && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                      <p className="text-sm text-amber-800">
                        ⚠️ Supplier <span className="font-semibold">&ldquo;{result.supplier.name}&rdquo;</span> not found
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={openSupplierModal} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700">
                          Yes, Add Supplier
                        </button>
                        <button type="button" onClick={() => setSupplierSkipped(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                          Skip
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Items ({matchedCount} matched{unmatchedCount > 0 ? `, ${unmatchedCount} to add` : ''})
                    </p>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Item</th>
                          <th className="px-2 py-1.5 text-right">Qty</th>
                          <th className="px-2 py-1.5 text-right">Rate</th>
                          <th className="px-2 py-1.5 text-right">GST</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {result.items.map((it, i) => {
                          const variant = [it.color, it.size].filter(Boolean).join(' / ');
                          return (
                            <tr key={i} className={it.matched ? '' : 'bg-amber-50'}>
                              <td className="px-2 py-1.5">
                                {it.name}
                                {variant && <span className="ml-1 text-xs text-gray-400">({variant})</span>}
                                {!it.matched && <span className="ml-1 text-xs text-amber-600">(no match)</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                              <td className="px-2 py-1.5 text-right">₹{it.rate}</td>
                              <td className="px-2 py-1.5 text-right">{it.gst_rate}%</td>
                            </tr>
                          );
                        })}
                        {result.items.length === 0 && (
                          <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400">No items extracted</td></tr>
                        )}
                      </tbody>
                    </table>
                    {unmatchedCount > 0 && (
                      <p className="mt-2 text-xs text-amber-600">
                        Unmatched items can be added as new products on the next screen.
                      </p>
                    )}
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={reset} className="btn-secondary">← Start over</button>
                    <button type="button" onClick={useData} className="btn-primary">
                      Use This Data &amp; Continue →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add-supplier modal (#2) */}
      {showSupModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-semibold text-gray-900">Add New Supplier</h3>
              <button type="button" onClick={() => setShowSupModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label text-xs">Name *</label>
                <input className="input text-sm" value={sName} onChange={(e) => setSName(e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">GSTIN</label>
                <input className="input text-sm font-mono" value={sGstin} onChange={(e) => setSGstin(e.target.value)} maxLength={15} />
              </div>
              <div>
                <label className="label text-xs">Phone</label>
                <input className="input text-sm" value={sPhone} onChange={(e) => setSPhone(e.target.value)} maxLength={20} />
              </div>
              <div>
                <label className="label text-xs">Address</label>
                <input className="input text-sm" value={sAddress} onChange={(e) => setSAddress(e.target.value)} maxLength={500} />
              </div>
              {supError && <p className="text-xs text-red-600">{supError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowSupModal(false)} className="btn-secondary text-sm">Cancel</button>
                <button type="button" onClick={saveSupplier} disabled={savingSup || !sName.trim()} className="btn-primary text-sm">
                  {savingSup ? 'Saving…' : 'Save Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
