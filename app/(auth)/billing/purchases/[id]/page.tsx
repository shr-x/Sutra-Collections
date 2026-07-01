import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Purchase Invoice' };

const BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700', partially_paid: 'bg-yellow-100 text-yellow-700',
};

export default async function PurchaseDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [purRes, lineRes] = await Promise.all([
    query(
      `SELECT p.*, s.name AS supplier_name, w.name AS warehouse_name
       FROM purchase_invoices p JOIN suppliers s ON s.id=p.supplier_id JOIN warehouses w ON w.id=p.warehouse_id
       WHERE p.id=$1`, [params.id]
    ),
    query(
      `SELECT pii.*, it.name AS item_name, it.unit,
              iv.size AS iv_size, iv.color AS iv_color,
              isz.size_name, ic.color_name
       FROM purchase_invoice_items pii
       JOIN items it ON it.id=pii.item_id
       LEFT JOIN item_variants iv ON iv.id=pii.variant_id
       LEFT JOIN item_sizes isz ON isz.id=pii.size_id
       LEFT JOIN item_colors ic ON ic.id=pii.color_id
       WHERE pii.purchase_invoice_id=$1 ORDER BY pii.sort_order`, [params.id]
    ),
  ]);

  if (!purRes.rows[0]) notFound();
  const pur = purRes.rows[0];
  const lines = lineRes.rows;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{pur.purchase_number}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[pur.status] ?? ''}`}>{pur.status.replace('_', ' ')}</span>
          {pur.include_in_gst && <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">ITC Eligible</span>}
        </div>
        <div className="flex gap-2">
          <a href={`/api/purchases/${params.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">Download PDF</a>
          <Link href={`/billing/debit-notes/new?purchase_id=${params.id}`} className="btn-secondary text-sm">+ Debit Note</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{pur.supplier_name}</p></div>
        <div className="card"><p className="text-xs text-gray-500">Warehouse</p><p className="font-medium">{pur.warehouse_name}</p></div>
        <div className="card"><p className="text-xs text-gray-500">Date</p><p className="font-medium">{new Date(pur.purchase_date).toLocaleDateString('en-IN')}</p></div>
        {pur.supplier_invoice_number && <div className="card"><p className="text-xs text-gray-500">Supplier Bill #</p><p className="font-medium">{pur.supplier_invoice_number}</p></div>}
        {pur.payment_mode && <div className="card"><p className="text-xs text-gray-500">Payment</p><p className="font-medium capitalize">{pur.payment_mode}</p></div>}
      </div>

      <div className="card p-0 overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
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
                  {(() => {
                    const newV = [line.color_name, line.size_name].filter((v: string | null) => v && v !== 'None' && v !== 'Regular').join(' / ');
                    const oldV = [line.iv_color, line.iv_size].filter(Boolean).join(' / ');
                    const label = newV || oldV;
                    return label ? <div className="text-xs text-gray-500">{label}</div> : null;
                  })()}
                </td>
                <td className="px-4 py-3 text-right">{Number(line.quantity)}</td>
                <td className="px-4 py-3 text-right">{formatInr(Number(line.rate))}</td>
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

      <div className="flex justify-end">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500"><span>CGST</span><span>{formatInr(Number(pur.total_cgst))}</span></div>
          <div className="flex justify-between text-gray-500"><span>SGST</span><span>{formatInr(Number(pur.total_sgst))}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-purple-700">{formatInr(Number(pur.grand_total))}</span></div>
        </div>
      </div>

      {pur.notes && <div className="mt-4 card"><p className="text-xs text-gray-500 mb-1">Notes</p><p className="text-sm">{pur.notes}</p></div>}
    </div>
  );
}
