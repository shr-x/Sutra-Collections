import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { DeletePurchaseButton } from './_buttons';

interface PurchaseRow {
  id: string;
  purchase_number: string | null;
  purchase_date: string | Date;
  status: string;
  grand_total: string;
  amount_paid: string;
  supplier_name: string;
}

const STATUS_BADGE: Record<string, string> = {
  received: 'bg-green-900/50 text-green-400',
  draft: 'bg-gray-700 text-gray-400',
  cancelled: 'bg-red-900/50 text-red-400',
};

function fmtDate(dateStr: string | Date) {
  const s = typeof dateStr === 'string' ? dateStr : (dateStr as Date).toISOString();
  const [y, m, d] = s.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtMoney(val: string) {
  return `₹${parseFloat(val).toFixed(2)}`;
}

export default async function PurchasesPage() {
  await requireSA();

  const res = await query<PurchaseRow>(`
    SELECT p.id, p.purchase_number, p.purchase_date, p.status, p.grand_total, p.amount_paid,
           COALESCE(s.name, '—') AS supplier_name
    FROM purchase_invoices p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.purchase_date DESC
    LIMIT 200
  `);

  const purchases = res.rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Purchase Invoices</h1>
        <Link
          href="/sa-console-x7k2/purchases/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Purchase
        </Link>
      </div>

      <p className="text-xs text-gray-500">
        Showing {purchases.length} purchase{purchases.length !== 1 ? 's' : ''} (max 200)
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Invoice #', 'Date', 'Supplier', 'Status', 'Total', 'Paid', 'Balance', 'Actions'].map(
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
            {purchases.map((p) => {
              const balance = parseFloat(p.grand_total) - parseFloat(p.amount_paid);
              return (
                <tr key={p.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-white">{p.purchase_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{fmtDate(p.purchase_date)}</td>
                  <td className="px-4 py-3 text-gray-300">{p.supplier_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[p.status] ?? 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{fmtMoney(p.grand_total)}</td>
                  <td className="px-4 py-3 text-gray-300">{fmtMoney(p.amount_paid)}</td>
                  <td
                    className={`px-4 py-3 ${balance > 0.01 ? 'text-yellow-400' : 'text-gray-300'}`}
                  >
                    {fmtMoney(balance.toFixed(2))}
                  </td>
                  <td className="px-4 py-3">
                    <DeletePurchaseButton
                      id={p.id}
                      invoiceNumber={p.purchase_number ?? p.id}
                    />
                  </td>
                </tr>
              );
            })}
            {purchases.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                  No purchase invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
