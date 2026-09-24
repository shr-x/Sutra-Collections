'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatInr } from '@/lib/gst';
import { recordPaymentAction, clearCustomerDuesAction, bulkCollectDuesAction } from '@/app/(auth)/billing/invoices/actions';
import CollectPaymentModal from '@/components/collect-payment-modal';
import ConfirmForm from '@/components/confirm-form';

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  payment_mode: string | null;
  balance_due: number;
  customer_id: string;
  customer_name: string;
  phone: string | null;
}

function BulkCollectBar({
  selectedRows, onDone, onClear,
}: {
  selectedRows: InvoiceRow[]; onDone: () => void; onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const total = selectedRows.reduce((s, r) => s + r.balance_due, 0);
  const customerName = selectedRows[0]?.customer_name ?? '';

  function handleConfirm() {
    setError('');
    startTransition(async () => {
      const res = await bulkCollectDuesAction(selectedRows.map((r) => r.id));
      if (res.success) {
        setConfirming(false);
        onDone();
      } else {
        setError(res.error ?? 'Failed to collect payments.');
      }
    });
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:left-56">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold text-gray-800">{selectedRows.length} invoice{selectedRows.length !== 1 ? 's' : ''}</span>
            <span className="text-gray-400"> selected · </span>
            <span className="font-semibold text-purple-700">{customerName}</span>
            <span className="text-gray-400"> · Total </span>
            <span className="font-bold text-red-700">{formatInr(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClear} className="btn-ghost btn-sm">Clear</button>
            <button type="button" onClick={() => setConfirming(true)} className="btn-primary btn-sm">
              Collect All
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirming(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-gray-900">Collect {selectedRows.length} Invoices</h3>
            <p className="mb-4 text-xs text-gray-500">{customerName}</p>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
              {selectedRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-gray-600">{r.invoice_number}</span>
                  <span className="font-medium text-gray-700">{formatInr(r.balance_due)}</span>
                </div>
              ))}
            </div>

            <div className="mb-5 flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2">
              <span className="text-sm text-gray-600">Total to collect</span>
              <span className="text-lg font-bold text-purple-700">{formatInr(total)}</span>
            </div>
            <p className="mb-4 text-xs text-gray-400">
              Sends ONE combined WhatsApp payment confirmation to {customerName} — not one per invoice.
            </p>

            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Collecting…' : 'Confirm & Collect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function DuesRows({ rows, totalDue }: { rows: InvoiceRow[]; totalDue: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedCustomerId = rows.find((r) => selected.has(r.id))?.customer_id ?? null;
  const selectedRows = rows.filter((r) => selected.has(r.id));

  function toggle(row: InvoiceRow) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
      }
      return next;
    });
  }

  const clear = () => setSelected(new Set());

  if (rows.length === 0) {
    return (
      <>
        <div className="sm:hidden card text-center py-8">
          <span className="text-4xl">🎉</span>
          <p className="mt-2 text-sm font-medium text-gray-500">All dues are cleared!</p>
        </div>
        <div className="hidden sm:block card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="px-4 py-12 text-center">
                <span className="text-4xl">🎉</span>
                <p className="mt-2 text-sm font-medium text-gray-500">All dues are cleared!</p>
              </td></tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile: stacked due cards */}
      <div className="sm:hidden space-y-3 pb-16">
        {rows.map((row) => {
          const payAction = recordPaymentAction.bind(null, row.id);
          const disabledCheckbox = selectedCustomerId !== null && selectedCustomerId !== row.customer_id;
          return (
            <div key={row.id} className="card">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    disabled={disabledCheckbox}
                    onChange={() => toggle(row)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 disabled:opacity-30"
                    title={disabledCheckbox ? 'Only one customer can be bulk-collected at a time' : 'Select for bulk collect'}
                  />
                  <Link href={`/customers/${row.customer_id}`}
                    className="font-semibold text-purple-700 hover:underline leading-tight">
                    {row.customer_name}
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums font-bold text-red-700 text-sm">
                    {formatInr(row.balance_due)}
                  </span>
                  <ConfirmForm
                    action={clearCustomerDuesAction.bind(null, row.customer_id)}
                    title="Clear Due"
                    message={`Clear this due for ${row.customer_name}? Marks their invoice(s) as fully paid — no notification is sent to the customer.`}
                    confirmLabel="Clear Due"
                  >
                    <button type="submit" className="text-gray-300 hover:text-red-500 text-base leading-none" title="Clear due (silent)">
                      ✕
                    </button>
                  </ConfirmForm>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                <div>
                  <span className="text-gray-400">Invoice </span>
                  <Link href={`/billing/invoices/${row.id}`} className="font-mono text-purple-600 hover:underline">
                    {row.invoice_number}
                  </Link>
                </div>
                <div><span className="text-gray-400">Phone </span>{row.phone ?? '—'}</div>
                <div><span className="text-gray-400">Date </span>{new Date(row.invoice_date).toLocaleDateString('en-IN')}</div>
                <div><span className="text-gray-400">Mode </span><span className="capitalize">{row.payment_mode ?? '—'}</span></div>
              </div>
              <CollectPaymentModal
                balance={row.balance_due}
                action={payAction}
                invoiceNumber={row.invoice_number}
                customerName={row.customer_name}
                returnTo="/customers/dues"
              />
            </div>
          );
        })}
        <div className="card flex justify-between items-center text-sm font-semibold">
          <span>{rows.length} invoice{rows.length !== 1 ? 's' : ''}</span>
          <span className="tabular-nums text-red-700">{formatInr(totalDue)}</span>
        </div>
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block card p-0 overflow-x-auto pb-16">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-4 py-3"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mode</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-red-700">Balance Due</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const payAction = recordPaymentAction.bind(null, row.id);
              const disabledCheckbox = selectedCustomerId !== null && selectedCustomerId !== row.customer_id;
              return (
                <tr key={row.id} className="even:bg-gray-50/60 hover:bg-purple-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      disabled={disabledCheckbox}
                      onChange={() => toggle(row)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 disabled:opacity-30"
                      title={disabledCheckbox ? 'Only one customer can be bulk-collected at a time' : 'Select for bulk collect'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${row.customer_id}`}
                      className="font-medium text-purple-700 hover:underline">
                      {row.customer_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/billing/invoices/${row.id}`}
                      className="font-mono text-xs text-purple-600 hover:underline">
                      {row.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(row.invoice_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs capitalize">
                    {row.payment_mode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-700">
                    {formatInr(row.balance_due)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CollectPaymentModal
                        balance={row.balance_due}
                        action={payAction}
                        invoiceNumber={row.invoice_number}
                        customerName={row.customer_name}
                        returnTo="/customers/dues"
                      />
                      <ConfirmForm
                        action={clearCustomerDuesAction.bind(null, row.customer_id)}
                        title="Clear Due"
                        message={`Clear this due for ${row.customer_name}? Marks their invoice(s) as fully paid — no notification is sent to the customer.`}
                        confirmLabel="Clear Due"
                      >
                        <button type="submit" className="text-gray-300 hover:text-red-500 text-base leading-none" title="Clear due (silent)">
                          ✕
                        </button>
                      </ConfirmForm>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td colSpan={6} className="px-4 py-3 text-sm">
                {rows.length} invoice{rows.length !== 1 ? 's' : ''}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-red-700">{formatInr(totalDue)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {selectedRows.length > 0 && (
        <BulkCollectBar selectedRows={selectedRows} onDone={clear} onClear={clear} />
      )}
    </>
  );
}
