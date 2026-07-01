'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { calcLine, calcInvoiceTotals, formatInr } from '@/lib/gst';
import type { ActionResult } from '@/types';
import ConfirmDialog from '@/components/confirm-dialog';

interface CustomerOpt { id: string; name: string }
interface WarehouseOpt { id: string; name: string }

interface SearchInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  grand_total: string;
  amount_paid: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
}

interface InvoiceItem {
  id: string;
  item_id: string;
  item_name: string;
  variant_id: string | null;
  size: string | null;
  color: string | null;
  quantity: string;
  rate: string;
  gst_rate: string;
  hsn_code: string | null;
}

interface Props {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  customers: CustomerOpt[];
  warehouses: WarehouseOpt[];
  defaultWarehouseId: string | null;
  invoiceId?: string;
  invoiceLines: InvoiceItem[];
  preselectedCustomerId?: string;
}

let _key = 0;
function nk() { return `cn-${++_key}`; }

interface RefundLine {
  key: string;
  item_id: string;
  item_name: string;
  variant_id: string | null;
  size: string | null;
  color: string | null;
  invoice_item_id: string | null;
  quantity: number;
  maxQty: number;
  rate: number;
  gst_rate: number;
  hsn_code: string | null;
}

export default function RefundForm({
  action, customers, warehouses, defaultWarehouseId,
  invoiceId: initialInvoiceId, invoiceLines, preselectedCustomerId,
}: Props) {
  const [state, formAction] = useFormState<ActionResult, FormData>(action, { success: false });
  const [pending, startTransition] = useTransition();

  // ── Step: 'search' | 'items' | 'confirm' ─────────────────────────────────
  const [step, setStep] = useState<'search' | 'items' | 'confirm'>(
    initialInvoiceId ? 'items' : 'search'
  );

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchInvoice[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Selected invoice ──────────────────────────────────────────────────────
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialInvoiceId ?? '');
  const [selectedInvoice, setSelectedInvoice] = useState<SearchInvoice | null>(null);
  const [fetchedLines, setFetchedLines] = useState<InvoiceItem[]>(invoiceLines);
  const [linesLoading, setLinesLoading] = useState(false);

  // ── Refund selection ──────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(invoiceLines.map((l) => l.id))
  );
  const [refundLines, setRefundLines] = useState<RefundLine[]>(() =>
    invoiceLines.map((il) => ({
      key: nk(),
      item_id: il.item_id,
      item_name: il.item_name,
      variant_id: il.variant_id,
      size: il.size,
      color: il.color,
      invoice_item_id: il.id,
      quantity: Number(il.quantity),
      maxQty: Number(il.quantity),
      rate: Number(il.rate),
      gst_rate: Number(il.gst_rate),
      hsn_code: il.hsn_code,
    }))
  );

  // ── Form fields ───────────────────────────────────────────────────────────
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? '');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<'refund' | 'loyalty_points'>('refund');

  // ── Confirm dialogs ───────────────────────────────────────────────────────
  const [showConfirm1, setShowConfirm1] = useState(false);
  const [showConfirm2, setShowConfirm2] = useState(false);

  // ── Search logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/invoices/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowDropdown(true);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch invoice items when invoice selected
  async function selectInvoice(inv: SearchInvoice) {
    setSelectedInvoice(inv);
    setSelectedInvoiceId(inv.id);
    setShowDropdown(false);
    setSearchQuery(`${inv.invoice_number}${inv.customer_name ? ` — ${inv.customer_name}` : ''}`);
    setLinesLoading(true);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/items`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw)) throw new Error('Unexpected response format');
      const data: InvoiceItem[] = raw;
      setFetchedLines(data);
      const newLines = data.map((il) => ({
        key: nk(),
        item_id: il.item_id,
        item_name: il.item_name,
        variant_id: il.variant_id,
        size: il.size,
        color: il.color,
        invoice_item_id: il.id,
        quantity: Number(il.quantity),
        maxQty: Number(il.quantity),
        rate: Number(il.rate),
        gst_rate: Number(il.gst_rate),
        hsn_code: il.hsn_code,
      }));
      setRefundLines(newLines);
      setSelectedIds(new Set(data.map((l) => l.id)));
      setStep('items');
    } catch (err) {
      console.error('[RefundForm] Failed to load invoice items:', err);
    }
    finally { setLinesLoading(false); }
  }

  const selectedLines = refundLines.filter((l) => l.invoice_item_id && selectedIds.has(l.invoice_item_id));
  const lineResults = selectedLines.map((l) => calcLine({ quantity: l.quantity, rate: l.rate, gstRate: l.gst_rate }));
  const totals = calcInvoiceTotals(lineResults);

  const handleSubmit = () => {
    const fd = new FormData();
    const customerId = selectedInvoice
      ? (customers.find((c) =>
          c.name === selectedInvoice.customer_name
        )?.id ?? preselectedCustomerId ?? null)
      : (preselectedCustomerId ?? null);

    fd.set('payload', JSON.stringify({
      invoice_id: selectedInvoiceId || null,
      customer_id: customerId,
      warehouse_id: warehouseId,
      reason,
      resolution,
      items: selectedLines.map((l) => ({
        item_id: l.item_id,
        variant_id: l.variant_id,
        invoice_item_id: l.invoice_item_id,
        quantity: l.quantity,
        rate: l.rate,
        gst_rate: l.gst_rate,
        hsn_code: l.hsn_code,
      })),
    }));
    startTransition(() => formAction(fd));
  };

  const customerName = selectedInvoice?.customer_name ?? 'Walk-in';
  const summaryText = `Refund Rs.${totals.grandTotal.toFixed(0)} for ${selectedLines.length} item(s) to ${customerName}`;

  // ── Step 1: Search ────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Find Invoice to Refund</h2>
          <div ref={searchRef} className="relative">
            <input
              autoFocus
              type="text"
              className="input w-full"
              placeholder="Search by invoice number, customer name, or phone…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            />
            {searchLoading && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching…</span>
            )}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {searchResults.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectInvoice(inv); }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-purple-50 first:rounded-t-lg last:rounded-b-lg border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold text-purple-700">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">{inv.customer_name ?? 'Walk-in'} · {new Date(inv.invoice_date).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatInr(Number(inv.grand_total))}</p>
                      <p className="text-xs text-gray-400 capitalize">{inv.status}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-400">
                No invoices found
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Type last 4 digits of invoice number, customer name, or phone number
          </p>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setStep('items')}
            className="text-sm text-purple-600 hover:underline"
          >
            Skip — manual refund (no linked invoice) →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Select items ──────────────────────────────────────────────────
  if (step === 'items') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {state.error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
        )}

        {selectedInvoice && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm">
            <p className="font-semibold text-purple-800">{selectedInvoice.invoice_number}</p>
            <p className="text-purple-600 text-xs mt-0.5">
              {selectedInvoice.customer_name ?? 'Walk-in'} · {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-IN')} · {formatInr(Number(selectedInvoice.grand_total))}
            </p>
          </div>
        )}

        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Select Items to Refund</h2>

          {linesLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading items…</p>
          ) : refundLines.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No items. Add items below.</p>
          ) : (
            <div className="divide-y divide-gray-100 mb-4">
              {refundLines.map((line) => {
                const checked = !!line.invoice_item_id && selectedIds.has(line.invoice_item_id);
                const varLabel = [line.color, line.size].filter(Boolean).join(' / ');
                return (
                  <div key={line.key} className="flex items-center gap-3 py-3">
                    {line.invoice_item_id && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(line.invoice_item_id!);
                            else next.delete(line.invoice_item_id!);
                            return next;
                          });
                        }}
                        className="h-4 w-4 accent-purple-600"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{line.item_name}</p>
                      {varLabel && <p className="text-xs text-gray-500">{varLabel}</p>}
                      <p className="text-xs text-gray-400">
                        {formatInr(line.rate)} · GST {line.gst_rate}%
                        {line.maxQty ? ` · Purchased qty: ${line.maxQty}` : ''}
                      </p>
                    </div>
                    {checked && (
                      <div className="w-24">
                        <label className="text-xs text-gray-400">Return qty</label>
                        <input
                          type="number"
                          className="input w-full text-sm py-1"
                          value={line.quantity}
                          min="0.001"
                          max={line.maxQty || undefined}
                          step="0.001"
                          onChange={(e) => setRefundLines((prev) =>
                            prev.map((l) => l.key === line.key
                              ? { ...l, quantity: Math.min(parseFloat(e.target.value) || 1, l.maxQty || 999) }
                              : l
                            )
                          )}
                        />
                      </div>
                    )}
                    <div className="text-right w-20 text-sm font-medium">
                      {formatInr(line.rate * line.quantity)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Refund Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Return Warehouse *</label>
              <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                <option value="">Select warehouse</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Refund Mode</label>
              <div className="flex gap-2">
                {(['refund', 'loyalty_points'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setResolution(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      resolution === m
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                    }`}
                  >
                    {m === 'refund' ? 'Direct Refund' : 'Loyalty Points'}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Reason</label>
              <input
                type="text"
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for return…"
                maxLength={500}
              />
            </div>
          </div>

          {/* Totals — back-calculated from inclusive price */}
          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Taxable value</span>
                <span>{formatInr(totals.grandTotal - totals.totalCgst - totals.totalSgst)}</span>
              </div>
              <div className="flex justify-between text-gray-500"><span>+ CGST</span><span>{formatInr(totals.totalCgst)}</span></div>
              <div className="flex justify-between text-gray-500"><span>+ SGST</span><span>{formatInr(totals.totalSgst)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Refund Total</span>
                <span className="text-purple-700">{formatInr(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep('search')}
            className="btn-secondary"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={selectedLines.length === 0 || !warehouseId}
            onClick={() => setShowConfirm1(true)}
            className="btn-primary"
          >
            Review Refund →
          </button>
        </div>

        {/* First confirmation */}
        <ConfirmDialog
          open={showConfirm1}
          title="Confirm Refund"
          message={`${summaryText}?\n\nThis will return stock and post a GST credit note.`}
          confirmLabel="Yes, proceed"
          onConfirm={() => { setShowConfirm1(false); setShowConfirm2(true); }}
          onCancel={() => setShowConfirm1(false)}
        />

        {/* Second (final) confirmation */}
        <ConfirmDialog
          open={showConfirm2}
          title="Final Confirmation"
          message={`Are you absolutely sure? This action cannot be undone.\n\n${summaryText}.`}
          confirmLabel={pending ? 'Processing…' : 'Confirm Refund'}
          onConfirm={() => { setShowConfirm2(false); handleSubmit(); }}
          onCancel={() => setShowConfirm2(false)}
        />
      </div>
    );
  }

  return null;
}
