import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Credit Note' };

export default async function CreditNoteDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin', 'staff');

  const [cnRes, lineRes] = await Promise.all([
    query(`SELECT cn.*, c.name AS customer_name, i.invoice_number FROM credit_notes cn LEFT JOIN customers c ON c.id=cn.customer_id LEFT JOIN invoices i ON i.id=cn.invoice_id WHERE cn.id=$1`, [params.id]),
    query(`SELECT cni.*, it.name AS item_name FROM credit_note_items cni JOIN items it ON it.id=cni.item_id WHERE cni.credit_note_id=$1`, [params.id]),
  ]);

  if (!cnRes.rows[0]) notFound();
  const cn = cnRes.rows[0];
  const lines = lineRes.rows;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{cn.credit_note_number}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cn.status === 'issued' ? 'bg-amber-100 text-amber-700' : cn.status === 'settled' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{cn.status}</span>
        </div>
        <a href={`/api/credit-notes/${params.id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">PDF</a>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {cn.customer_name && <div className="card"><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{cn.customer_name}</p></div>}
        {cn.invoice_number && <div className="card"><p className="text-xs text-gray-500">Against Invoice</p><Link href={`/billing/invoices/${cn.invoice_id}`} className="font-mono text-purple-700 hover:underline">{cn.invoice_number}</Link></div>}
        {cn.resolution && <div className="card"><p className="text-xs text-gray-500">Resolution</p><p className="font-medium capitalize">{cn.resolution}</p></div>}
        {cn.reason && <div className="card"><p className="text-xs text-gray-500">Reason</p><p className="text-sm">{cn.reason}</p></div>}
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
                <td className="px-4 py-3 font-medium">{line.item_name}</td>
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
        <div className="w-60 space-y-2 text-sm">
          <div className="flex justify-between text-gray-500"><span>CGST</span><span>{formatInr(Number(cn.total_cgst))}</span></div>
          <div className="flex justify-between text-gray-500"><span>SGST</span><span>{formatInr(Number(cn.total_sgst))}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Credit Total</span><span className="text-purple-700">{formatInr(Number(cn.grand_total))}</span></div>
        </div>
      </div>
    </div>
  );
}
