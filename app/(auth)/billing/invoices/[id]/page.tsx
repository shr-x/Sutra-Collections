import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import { cancelInvoiceAction, sendReminderAction, applyStoreCreditAction, retryInvoiceWaAction } from '../actions';
import type { InvoiceStatus } from '@/types';
import ConfirmForm from '@/components/confirm-form';
import ReminderButton from './reminder-button';
import WaToast from '@/components/wa-toast';

export const metadata: Metadata = { title: 'Invoice' };

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft:          'bg-gray-100 text-gray-600',
  issued:         'bg-blue-100 text-blue-700',
  paid:           'bg-green-600 text-white',
  partially_paid: 'bg-yellow-100 text-yellow-800',
  overdue:        'bg-red-100 text-red-700',
  cancelled:      'bg-red-600 text-white',
};

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { wa?: string; reason?: string };
}) {
  const session = await requireRole('admin', 'staff');

  const [invRes, itemsRes, settingsRes] = await Promise.all([
    query(
      `SELECT i.*, c.name AS customer_name, c.address AS customer_address, c.gstin AS customer_gstin,
              c.phone AS customer_phone, c.store_credit_balance,
              w.name AS warehouse_name, u.name AS created_by_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       JOIN warehouses w ON w.id = i.warehouse_id
       JOIN users u ON u.id = i.created_by
       WHERE i.id = $1`,
      [params.id]
    ),
    query(
      `SELECT ii.*, it.name AS item_name, iv.size, iv.color, iv.sku
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       LEFT JOIN item_variants iv ON iv.id = ii.variant_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.sort_order`,
      [params.id]
    ),
    query<{ id: string; day_threshold: number; tone: string }>(
      `SELECT id, day_threshold, tone FROM reminder_settings WHERE is_active=TRUE ORDER BY day_threshold`
    ),
  ]);

  if (!invRes.rows[0]) notFound();

  const inv      = invRes.rows[0];
  const lines    = itemsRes.rows;
  const settings = settingsRes.rows;
  const balance  = Number(inv.grand_total) - Number(inv.amount_paid);
  const storeCredit = Number(inv.store_credit_balance ?? 0);

  const ageMs   = Date.now() - new Date(inv.created_at).getTime();
  const canEdit = inv.status !== 'cancelled' && (inv.status === 'draft' || ageMs < 60 * 60 * 1000);

  const cancelAction = cancelInvoiceAction.bind(null, params.id);
  const creditAction = applyStoreCreditAction.bind(null, params.id);
  const retryWaAction = retryInvoiceWaAction.bind(null, params.id);

  const upiParams = inv.customer_phone
    ? new URLSearchParams({
        pa: process.env.UPI_VPA ?? 'sutra@upi',
        am: balance.toFixed(2),
        tn: inv.invoice_number,
      }).toString()
    : null;
  const upiQrUrl = `/api/invoices/${params.id}/upi-qr`;

  const hasOutstanding = balance > 0 && inv.status !== 'cancelled' && inv.customer_phone;

  return (
    <div className="max-w-4xl mx-auto">
      <WaToast wa={searchParams.wa} reason={searchParams.reason} retryAction={retryWaAction} />
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{inv.invoice_number}</h1>
          <span className={`mt-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize shadow-sm ${STATUS_BADGE[inv.status as InvoiceStatus]}`}>
            {(inv.status as string).replace('_', ' ')}
          </span>
        </div>
        <div className="flex gap-2">
          <a href={`/api/invoices/${params.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
            A4 PDF
          </a>
          <a href={`/api/invoices/${params.id}/thermal`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
            Thermal
          </a>
          {canEdit && (
            <Link href={`/billing/invoices/${params.id}/edit`} className="btn-secondary text-sm">Edit</Link>
          )}
          {session.role === 'admin' && inv.status !== 'cancelled' && (
            canEdit ? (
              <ConfirmForm action={cancelAction} message="Cancel this invoice? Stock will be reversed." className="inline">
                <button
                  type="submit"
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  Cancel
                </button>
              </ConfirmForm>
            ) : (
              <button
                type="button"
                disabled
                title="Cannot cancel after 1 hour of issue"
                className="cursor-not-allowed rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-300"
              >
                Cancel
              </button>
            )
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs text-gray-500">Date</p>
          <p className="font-medium">{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</p>
        </div>
        {inv.due_date && (
          <div className="card">
            <p className="text-xs text-gray-500">Due Date</p>
            <p className="font-medium">{new Date(inv.due_date).toLocaleDateString('en-IN')}</p>
          </div>
        )}
        <div className="card">
          <p className="text-xs text-gray-500">Customer</p>
          {inv.customer_id ? (
            <Link href={`/customers/${inv.customer_id}`} className="font-medium text-purple-700 hover:underline">
              {inv.customer_name}
            </Link>
          ) : (
            <p className="font-medium">Walk-in</p>
          )}
          {inv.customer_gstin && <p className="text-xs text-gray-500">GSTIN: {inv.customer_gstin}</p>}
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Warehouse</p>
          <p className="font-medium">{inv.warehouse_name}</p>
        </div>
        {inv.payment_mode && (
          <div className="card">
            <p className="text-xs text-gray-500">Payment</p>
            <p className="font-medium capitalize">{inv.payment_mode.replace('_', ' ')}</p>
          </div>
        )}
        <div className="card">
          <p className="text-xs text-gray-500">Created by</p>
          <p className="font-medium">{inv.created_by_name}</p>
        </div>
      </div>

      {Number(inv.grand_total) > 50000 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ Invoice value exceeds ₹50,000 — E-Way Bill required before dispatch. Generate on GST portal.
        </div>
      )}

      {/* Line Items */}
      <div className="card p-0 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">HSN</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Disc.</th>
              <th className="px-4 py-3 text-right">GST%</th>
              <th className="px-4 py-3 text-right">Taxable</th>
              <th className="px-4 py-3 text-right">CGST</th>
              <th className="px-4 py-3 text-right">SGST</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{line.item_name}</div>
                  {(line.color || line.size) && (
                    <div className="text-xs text-gray-500">{[line.color, line.size].filter(Boolean).join(' / ')}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{line.hsn_code ?? '—'}</td>
                <td className="px-4 py-3 text-right">{Number(line.quantity)}</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.rate))}</td>
                <td className="px-4 py-3 text-right text-red-500">
                  {Number(line.discount_amount) > 0 ? `-${formatInr(Number(line.discount_amount))}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{Number(line.gst_rate)}%</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.taxable_value))}</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.cgst_amount))}</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.sgst_amount))}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatInr(Number(line.total_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals + UPI QR */}
      <div className="flex justify-between gap-6 mb-6">
        {/* UPI QR */}
        {balance > 0 && upiParams && (
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={upiQrUrl} alt="UPI QR" width={140} height={140} className="rounded-lg border border-gray-200" />
            <p className="mt-1 text-xs text-gray-500">Scan to pay ₹{balance.toFixed(0)}</p>
          </div>
        )}

        <div className="flex-1 flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            {Number(inv.invoice_discount_amount) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Invoice Discount</span>
                <span>-{formatInr(Number(inv.invoice_discount_amount))}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>CGST</span><span>{formatInr(Number(inv.total_cgst))}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>SGST</span><span>{formatInr(Number(inv.total_sgst))}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Grand Total</span>
              <span className="text-purple-700">{formatInr(Number(inv.grand_total))}</span>
            </div>
            {Number(inv.amount_paid) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Paid</span>
                <span>{formatInr(Number(inv.amount_paid))}</span>
              </div>
            )}
            {Number(inv.store_credit_used) > 0 && (
              <div className="flex justify-between text-blue-600 text-xs">
                <span>Store credit used</span>
                <span>{formatInr(Number(inv.store_credit_used))}</span>
              </div>
            )}
            {balance > 0 && (
              <div className="flex justify-between font-semibold text-red-700 border-t pt-2">
                <span>Balance Due</span>
                <span>{formatInr(balance)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Apply Store Credit */}
      {balance > 0 && inv.status !== 'cancelled' && inv.customer_id && storeCredit > 0 && (
        <div className="card mt-4 bg-blue-50 border-blue-200">
          <h3 className="mb-1 font-semibold text-blue-800">Apply Store Credit</h3>
          <p className="text-xs text-blue-600 mb-3">
            Customer has {formatInr(storeCredit)} in store credit available.
          </p>
          <form action={creditAction} className="flex gap-3 items-end">
            <div>
              <label className="form-label">Amount to Apply (₹)</label>
              <input name="apply_amount" type="number" className="form-input w-32"
                defaultValue={Math.min(balance, storeCredit).toFixed(2)}
                min="0.01" step="0.01"
                max={Math.min(balance, storeCredit)} />
            </div>
            <button type="submit" className="btn-primary text-sm bg-blue-600 hover:bg-blue-700">Apply</button>
          </form>
        </div>
      )}

      {/* Send Reminder */}
      {hasOutstanding && (
        <div className="card mt-4">
          <h3 className="mb-3 font-semibold text-gray-900">Send Payment Reminder</h3>
          <ReminderButton invoiceId={params.id} settings={settings} action={sendReminderAction} />
        </div>
      )}

      {inv.notes && (
        <div className="mt-4 card">
          <p className="text-xs text-gray-500 mb-1">Notes</p>
          <p className="text-sm text-gray-700">{inv.notes}</p>
        </div>
      )}
    </div>
  );
}
