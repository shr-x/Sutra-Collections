import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import { updateQuotationStatusAction, convertQuotationToInvoiceAction } from '../actions';
import ConfirmForm from '@/components/confirm-form';

export const metadata: Metadata = { title: 'Quotation' };

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600',
  expired: 'bg-gray-100 text-gray-400', converted: 'bg-purple-100 text-purple-700',
};

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [qRes, lineRes] = await Promise.all([
    query(
      `SELECT q.*, c.name AS customer_name, w.name AS warehouse_name
       FROM quotations q
       LEFT JOIN customers c ON c.id=q.customer_id
       JOIN warehouses w ON w.id=q.warehouse_id
       WHERE q.id=$1`, [params.id]
    ),
    query(
      `SELECT qi.*, it.name AS item_name, iv.size, iv.color FROM quotation_items qi
       JOIN items it ON it.id=qi.item_id LEFT JOIN item_variants iv ON iv.id=qi.variant_id
       WHERE qi.quotation_id=$1 ORDER BY qi.sort_order`, [params.id]
    ),
  ]);

  if (!qRes.rows[0]) notFound();
  const q = qRes.rows[0];
  const lines = lineRes.rows;

  const markSentAction = updateQuotationStatusAction.bind(null, params.id, 'sent');
  const markAcceptedAction = updateQuotationStatusAction.bind(null, params.id, 'accepted');
  const markRejectedAction = updateQuotationStatusAction.bind(null, params.id, 'rejected');
  const convertAction = convertQuotationToInvoiceAction.bind(null, params.id);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{q.quotation_number}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[q.status] ?? ''}`}>{q.status}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={`/api/quotations/${params.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">PDF</a>
          {q.status === 'draft' && (
            <form action={markSentAction}><button type="submit" className="btn-secondary text-sm">Mark Sent</button></form>
          )}
          {(q.status === 'sent' || q.status === 'draft') && (
            <>
              <form action={markAcceptedAction}><button type="submit" className="btn-secondary text-sm">Accept</button></form>
              <form action={markRejectedAction}><button type="submit" className="btn-secondary text-sm">Reject</button></form>
            </>
          )}
          {(q.status === 'accepted' || q.status === 'sent') && (
            <ConfirmForm action={convertAction} message="Convert this quotation to an invoice? Stock will be deducted.">
              <button type="submit" className="btn-primary text-sm">Convert to Invoice</button>
            </ConfirmForm>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{q.customer_name ?? 'Walk-in'}</p></div>
        <div className="card"><p className="text-xs text-gray-500">Warehouse</p><p className="font-medium">{q.warehouse_name}</p></div>
        {q.valid_until && <div className="card"><p className="text-xs text-gray-500">Valid Until</p><p className="font-medium">{new Date(q.valid_until).toLocaleDateString('en-IN')}</p></div>}
      </div>

      <div className="card p-0 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">GST%</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{line.item_name}</div>
                  {(line.color || line.size) && <div className="text-xs text-gray-500">{[line.color, line.size].filter(Boolean).join(' / ')}</div>}
                </td>
                <td className="px-4 py-3 text-right">{Number(line.quantity)}</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.rate))}</td>
                <td className="px-4 py-3 text-right text-gray-500">{Number(line.gst_rate)}%</td>
                <td className="px-4 py-3 text-right font-semibold">{formatInr(Number(line.total_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500"><span>CGST</span><span>{formatInr(Number(q.total_cgst))}</span></div>
          <div className="flex justify-between text-gray-500"><span>SGST</span><span>{formatInr(Number(q.total_sgst))}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-2">
            <span>Total</span><span className="text-purple-700">{formatInr(Number(q.grand_total))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
