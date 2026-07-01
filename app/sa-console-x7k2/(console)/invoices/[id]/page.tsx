import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CancelInvoiceButton, DeleteInvoiceButton } from '../_buttons';

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  grand_total: string;
  amount_paid: string;
  total_cgst: string | null;
  total_sgst: string | null;
  invoice_discount_amount: string | null;
  payment_mode: string | null;
  notes: string | null;
  warehouse_id: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  item_name: string | null;
  quantity: string;
  unit_price: string;
  gst_rate: string;
  taxable_value: string;
  cgst_amount: string;
  sgst_amount: string;
  total_price: string;
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-900/50 text-green-400',
  unpaid: 'bg-yellow-900/50 text-yellow-400',
  cancelled: 'bg-red-900/50 text-red-400',
  draft: 'bg-gray-700 text-gray-400',
};

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtMoney(val: string | null) {
  if (!val) return '—';
  return `₹${parseFloat(val).toFixed(2)}`;
}

interface Props {
  params: { id: string };
}

export default async function InvoiceDetailPage({ params }: Props) {
  await requireSA();

  const [invRes, itemsRes] = await Promise.all([
    query<InvoiceDetail>(
      `SELECT i.*, COALESCE(c.name, 'Walk-in') AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.id = $1`,
      [params.id]
    ),
    query<InvoiceItem>(
      `SELECT ii.*, it.name AS item_name
       FROM invoice_items ii
       LEFT JOIN items it ON it.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id`,
      [params.id]
    ),
  ]);

  const inv = invRes.rows[0];
  if (!inv) notFound();

  const items = itemsRes.rows;
  const balance = parseFloat(inv.grand_total) - parseFloat(inv.amount_paid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/sa-console-x7k2/invoices"
            className="text-sm text-gray-500 hover:text-gray-300"
          >
            ← Invoices
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">{inv.invoice_number}</h1>
          <p className="text-sm text-gray-400">{inv.customer_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/sa-console-x7k2/invoices/${params.id}/edit`}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Edit
          </Link>
          {inv.status !== 'cancelled' && <CancelInvoiceButton id={params.id} />}
          <DeleteInvoiceButton id={params.id} invoiceNumber={inv.invoice_number} />
        </div>
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Date', value: fmtDate(inv.invoice_date) },
          {
            label: 'Status',
            value: (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status] ?? 'bg-gray-700 text-gray-400'}`}
              >
                {inv.status}
              </span>
            ),
          },
          { label: 'Payment Mode', value: inv.payment_mode ?? '—' },
          { label: 'Grand Total', value: fmtMoney(inv.grand_total) },
          { label: 'Amount Paid', value: fmtMoney(inv.amount_paid) },
          {
            label: 'Balance',
            value: (
              <span className={balance > 0.01 ? 'text-yellow-400' : ''}>
                {fmtMoney(balance.toFixed(2))}
              </span>
            ),
          },
          { label: 'CGST', value: fmtMoney(inv.total_cgst) },
          { label: 'SGST', value: fmtMoney(inv.total_sgst) },
          { label: 'Discount', value: fmtMoney(inv.invoice_discount_amount) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <div className="mt-1 text-sm font-medium text-white">{value}</div>
          </div>
        ))}
      </div>

      {inv.notes && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="mb-1 text-xs text-gray-500">Notes</p>
          <p className="text-sm text-gray-300">{inv.notes}</p>
        </div>
      )}

      {/* PDF link */}
      <div>
        <a
          href={`/api/invoices/${params.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Open PDF ↗
        </a>
      </div>

      {/* Line items */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Line Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-gray-600">No line items found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-700/50">
                <tr>
                  {['Description', 'Item', 'Qty', 'Unit Price', 'GST %', 'Taxable', 'CGST', 'SGST', 'Total'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-white">{item.description}</td>
                    <td className="px-4 py-3 text-gray-400">{item.item_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtMoney(item.unit_price)}</td>
                    <td className="px-4 py-3 text-gray-300">{item.gst_rate}%</td>
                    <td className="px-4 py-3 text-gray-300">{fmtMoney(item.taxable_value)}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtMoney(item.cgst_amount)}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtMoney(item.sgst_amount)}</td>
                    <td className="px-4 py-3 font-medium text-white">{fmtMoney(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600">
        Invoice ID: {inv.id} · Created:{' '}
        {new Date(inv.created_at).toLocaleString('en-IN')}
      </p>
    </div>
  );
}
