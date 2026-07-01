'use client';

import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { calcLine, calcInvoiceTotals, formatInr } from '@/lib/gst';
import type { ActionResult } from '@/types';

interface SupplierOpt { id: string; name: string }
interface WarehouseOpt { id: string; name: string }
interface PurchaseInvoiceOpt {
  id: string;
  purchase_number: string;
  purchase_date: string;
  grand_total: string;
  amount_paid: string;
  status: string;
}
interface PurchaseItem {
  id: string;
  item_id: string;
  item_name: string;
  variant_id: string | null;
  quantity: string;
  current_stock: string;
  already_returned: string;
  rate: string;
  gst_rate: string;
  hsn_code: string | null;
  warehouse_id: string;
}

interface Props {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  suppliers: SupplierOpt[];
  warehouses: WarehouseOpt[];
  defaultWarehouseId: string | null;
}

let _k = 0;
function nk() { return `dn-${++_k}`; }

interface Line {
  key: string;
  item_id: string;
  item_name: string;
  variant_id: string | null;
  purchase_invoice_item_id: string | null;
  quantity: number;
  maxQty: number;
  rate: number;
  gst_rate: number;
  hsn_code: string | null;
}

export default function DebitNoteForm({ action, suppliers, warehouses, defaultWarehouseId }: Props) {
  const [state, formAction] = useFormState<ActionResult, FormData>(action, { success: false });
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? '');
  const [reason, setReason] = useState('');
  const [reducesItc, setReducesItc] = useState(true);

  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoiceOpt[]>([]);
  const [purchaseInvoicesLoading, setPurchaseInvoicesLoading] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');

  const [lines, setLines] = useState<Line[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  async function handleSupplierChange(id: string) {
    setSupplierId(id);
    setSelectedPurchaseId('');
    setLines([]);
    setSelectedKeys(new Set());
    if (!id) { setPurchaseInvoices([]); return; }
    setPurchaseInvoicesLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${id}/purchase-invoices`);
      const data = await res.json();
      setPurchaseInvoices(Array.isArray(data) ? data : []);
    } catch {
      setPurchaseInvoices([]);
    } finally {
      setPurchaseInvoicesLoading(false);
    }
  }

  async function handleInvoiceChange(id: string) {
    setSelectedPurchaseId(id);
    setLines([]);
    setSelectedKeys(new Set());
    if (!id) return;
    setLinesLoading(true);
    try {
      const res = await fetch(`/api/purchase-invoices/${id}/items`);
      const data: PurchaseItem[] = await res.json();
      const items = Array.isArray(data) ? data : [];
      const newLines: Line[] = items.map((item) => {
        const purchased = Number(item.quantity);
        const alreadyReturned = Number(item.already_returned ?? 0);
        const remaining = Math.max(0, purchased - alreadyReturned);
        const maxQty = Math.min(remaining, Number(item.current_stock));
        return {
          key: nk(),
          item_id: item.item_id,
          item_name: item.item_name,
          variant_id: item.variant_id,
          purchase_invoice_item_id: item.id,
          quantity: Math.min(1, maxQty),
          maxQty,
          rate: Number(item.rate),
          gst_rate: Number(item.gst_rate),
          hsn_code: item.hsn_code,
        };
      });
      setLines(newLines);
      // Only pre-select lines that still have returnable quantity
      setSelectedKeys(new Set(newLines.filter((l) => l.maxQty > 0).map((l) => l.key)));
      if (!defaultWarehouseId && items[0]?.warehouse_id) {
        setWarehouseId(items[0].warehouse_id);
      }
    } catch {
      setLines([]);
    } finally {
      setLinesLoading(false);
    }
  }

  const selectedLines = lines.filter((l) => selectedKeys.has(l.key));
  const lineResults = selectedLines.map((l) => calcLine({ quantity: l.quantity, rate: l.rate, gstRate: l.gst_rate }));
  const totals = calcInvoiceTotals(lineResults);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      purchase_invoice_id: selectedPurchaseId || null,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      reason,
      reduces_itc: reducesItc,
      items: selectedLines.map((l) => ({
        item_id: l.item_id,
        variant_id: l.variant_id,
        purchase_invoice_item_id: l.purchase_invoice_item_id,
        quantity: l.quantity,
        rate: l.rate,
        gst_rate: l.gst_rate,
        hsn_code: l.hsn_code,
      })),
    }));
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Step 1: Details */}
      <div className="card">
        <h2 className="mb-4 font-semibold text-gray-900">Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Supplier *</label>
            <select className="input" value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)} required>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Return Warehouse *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reason</label>
            <input
              type="text"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Reason for return…"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="itc" checked={reducesItc} onChange={(e) => setReducesItc(e.target.checked)} />
            <label htmlFor="itc" className="text-sm">Reduces ITC (reverses GST credit)</label>
          </div>
        </div>
      </div>

      {/* Step 2: Select purchase invoice */}
      {supplierId && (
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Select Purchase Invoice</h2>
          {purchaseInvoicesLoading ? (
            <p className="text-sm text-gray-400">Loading invoices…</p>
          ) : purchaseInvoices.length === 0 ? (
            <p className="text-sm text-gray-400">No purchase invoices found for this supplier.</p>
          ) : (
            <select className="input" value={selectedPurchaseId} onChange={(e) => handleInvoiceChange(e.target.value)}>
              <option value="">— Select a purchase invoice —</option>
              {purchaseInvoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.purchase_number} · {new Date(p.purchase_date).toLocaleDateString('en-IN')} · {formatInr(Number(p.grand_total))}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Step 3: Items as checkboxes */}
      {selectedPurchaseId && (
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Items to Return</h2>
          {linesLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading items…</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-gray-400">No items found for this invoice.</p>
          ) : (
            <>
              <div className="divide-y divide-gray-100 mb-4">
                {lines.map((line) => {
                  const checked = selectedKeys.has(line.key);
                  const lr = calcLine({ quantity: line.quantity, rate: line.rate, gstRate: line.gst_rate });
                  return (
                    <div key={line.key} className={`flex items-center gap-3 py-3 ${line.maxQty <= 0 ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={line.maxQty <= 0}
                        onChange={(e) => {
                          setSelectedKeys((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(line.key);
                            else next.delete(line.key);
                            return next;
                          });
                        }}
                        className="h-4 w-4 accent-purple-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{line.item_name}</p>
                        <p className="text-xs text-gray-400">{formatInr(line.rate)} · GST {line.gst_rate}%</p>
                        {line.maxQty <= 0 && (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            Already fully returned
                          </span>
                        )}
                      </div>
                      {checked && (
                        <div className="w-24">
                          <label className="text-xs text-gray-400">Return qty</label>
                          <input
                            type="number"
                            className="input w-full text-sm py-1"
                            value={line.quantity}
                            min="0.001"
                            max={line.maxQty}
                            step="0.001"
                            onChange={(e) => setLines((prev) =>
                              prev.map((l) => l.key === line.key
                                ? { ...l, quantity: Math.min(parseFloat(e.target.value) || 1, l.maxQty) }
                                : l
                              )
                            )}
                          />
                        </div>
                      )}
                      <div className="text-right w-24 text-sm font-medium">
                        {checked ? formatInr(lr.totalAmount) : <span className="text-gray-300">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedLines.length > 0 && (
                <div className="flex justify-end">
                  <div className="w-60 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-500">
                      <span>CGST</span>
                      <span>{formatInr(totals.totalCgst)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>SGST</span>
                      <span>{formatInr(totals.totalSgst)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Total</span>
                      <span className="text-purple-700">{formatInr(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || selectedLines.length === 0 || !supplierId || !warehouseId}
          className="btn-primary"
        >
          {pending ? 'Saving…' : 'Issue Debit Note'}
        </button>
      </div>
    </form>
  );
}
