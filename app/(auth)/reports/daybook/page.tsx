import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Daybook' };

interface DaybookRow {
  time: string;
  type: string;
  ref: string;
  entity: string;
  mode: string | null;
  amount: number;
  direction: 'in' | 'out';
  href: string;
}

export default async function DaybookPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  await requireRole('admin', 'accountant');

  const today = new Date().toISOString().slice(0, 10);
  const date = searchParams.date ?? today;

  let dbError: string | null = null;
  const rawData = await Promise.all([
    query(
      `SELECT i.id, i.invoice_number AS ref, i.invoice_date,
              COALESCE(c.name,'Walk-in') AS entity,
              i.payment_mode AS mode, i.grand_total AS amount,
              i.created_at AS time
       FROM invoices i
       LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.invoice_date=$1 AND i.status <> 'cancelled'
       ORDER BY i.created_at`,
      [date]
    ),
    // purchase_invoices uses purchase_number / purchase_date (not invoice_*)
    query(
      `SELECT p.id, p.purchase_number AS ref, p.purchase_date,
              COALESCE(s.name,'—') AS entity,
              p.payment_mode AS mode, p.grand_total AS amount,
              p.created_at AS time
       FROM purchase_invoices p
       LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE p.purchase_date=$1
       ORDER BY p.created_at`,
      [date]
    ),
    // expenses has no reference_number column
    query(
      `SELECT e.id, NULL::text AS ref, e.expense_date,
              e.description AS entity, e.payment_mode AS mode,
              e.amount, e.created_at AS time
       FROM expenses e
       WHERE e.expense_date=$1
       ORDER BY e.created_at`,
      [date]
    ),
  ]).catch((err) => {
    dbError = err instanceof Error ? err.message : 'Database error';
    return null;
  });

  if (!rawData) {
    return (
      <div>
        <div className="page-header">
          <div>
            <nav className="text-sm text-gray-400 mb-1">
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Daybook
            </nav>
            <h1 className="page-title">Daybook</h1>
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Database Error</p>
          <p className="mt-1 font-mono text-xs text-red-600">{dbError}</p>
          <p className="mt-2 text-xs text-gray-500">Run the Phase 8 migration SQL to resolve missing columns or tables.</p>
        </div>
      </div>
    );
  }

  const [salesRes, purchaseRes, expRes] = rawData;

  const rows: DaybookRow[] = [
    ...salesRes.rows.map((r) => ({
      time:      new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type:      'Sale',
      ref:       r.ref,
      entity:    r.entity,
      mode:      r.mode,
      amount:    Number(r.amount),
      direction: 'in' as const,
      href:      `/billing/invoices/${r.id}`,
    })),
    ...purchaseRes.rows.map((r) => ({
      time:      new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type:      'Purchase',
      ref:       r.ref ?? '—',
      entity:    r.entity,
      mode:      r.mode,
      amount:    Number(r.amount),
      direction: 'out' as const,
      href:      `/billing/purchases/${r.id}`,
    })),
    ...expRes.rows.map((r) => ({
      time:      new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      type:      'Expense',
      ref:       r.ref ?? '—',
      entity:    r.entity,
      mode:      r.mode,
      amount:    Number(r.amount),
      direction: 'out' as const,
      href:      `/accounting/expenses`,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const totalIn  = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
  const net      = totalIn - totalOut;

  let running = 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Daybook
          </nav>
          <h1 className="page-title">Daybook</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <a href={`/api/reports/daybook?date=${date}`} className="btn-secondary text-sm min-h-[44px]">
            Export CSV
          </a>
          <a href={`/api/reports/daybook/pdf?date=${date}`} className="btn-secondary text-sm min-h-[44px]" download>
            Export PDF
          </a>
        </div>
      </div>

      {/* Date picker */}
      <form method="get" className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Date</label>
        <DatePicker name="date" defaultValue={date} className="input" />
        <button type="submit" className="btn-primary text-sm">View</button>
        {date !== today && (
          <Link href="/reports/daybook" className="text-sm text-purple-600 hover:underline">
            Today
          </Link>
        )}
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Sales</p>
          <p className="text-xl font-bold text-green-700">{formatInr(totalIn)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Total Outflow</p>
          <p className="text-xl font-bold text-red-700">{formatInr(totalOut)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Net for the Day</p>
          <p className={`text-xl font-bold ${net >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
            {formatInr(net)}
          </p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">
            No transactions on {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'long' })}.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Time</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Type</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Reference</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Party</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Mode</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Running Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => {
                running += row.direction === 'in' ? row.amount : -row.amount;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">{row.time}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.type === 'Sale'     ? 'bg-green-100 text-green-700' :
                        row.type === 'Purchase' ? 'bg-blue-100 text-blue-700' :
                                                  'bg-gray-100 text-gray-600'
                      }`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={row.href} className="font-mono text-xs text-purple-700 hover:underline">
                        {row.ref}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.entity}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 capitalize">{row.mode ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${
                      row.direction === 'in' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {row.direction === 'out' ? '-' : ''}{formatInr(row.amount)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${running >= 0 ? 'text-gray-800' : 'text-red-700'}`}>
                      {formatInr(running)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
