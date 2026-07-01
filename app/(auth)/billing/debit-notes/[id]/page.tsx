import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Debit Note' };

export default async function DebitNoteDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [dnRes, lineRes] = await Promise.all([
    query(
      `SELECT dn.*, s.name AS supplier_name, p.purchase_number
       FROM debit_notes dn JOIN suppliers s ON s.id=dn.supplier_id
       LEFT JOIN purchase_invoices p ON p.id=dn.purchase_invoice_id
       WHERE dn.id=$1`, [params.id]
    ),
    query(
      `SELECT dni.*, it.name AS item_name FROM debit_note_items dni JOIN items it ON it.id=dni.item_id WHERE dni.debit_note_id=$1`, [params.id]
    ),
  ]);

  if (!dnRes.rows[0]) notFound();
  const dn = dnRes.rows[0];
  const lines = lineRes.rows;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title font-mono">{dn.debit_note_number}</h1>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${dn.status === 'issued' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{dn.status}</span>
          {dn.reduces_itc && <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">Reduces ITC</span>}
        </div>
        <a
          href={`/api/debit-notes/${params.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary text-sm"
        >
          Download PDF
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card"><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{dn.supplier_name}</p></div>
        {dn.purchase_number && (
          <div className="card"><p className="text-xs text-gray-500">Against Purchase</p>
            <Link href={`/billing/purchases/${dn.purchase_invoice_id}`} className="font-mono text-purple-700 hover:underline">{dn.purchase_number}</Link>
          </div>
        )}
        {dn.reason && <div className="card col-span-2"><p className="text-xs text-gray-500">Reason</p><p className="text-sm">{dn.reason}</p></div>}
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
          <div className="flex justify-between text-gray-500"><span>CGST</span><span>{formatInr(Number(dn.total_cgst))}</span></div>
          <div className="flex justify-between text-gray-500"><span>SGST</span><span>{formatInr(Number(dn.total_sgst))}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span className="text-purple-700">{formatInr(Number(dn.grand_total))}</span></div>
        </div>
      </div>
    </div>
  );
}
