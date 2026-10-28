import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';
import { searchProducts, getProductReport, monthLabel } from '@/lib/reports/find-product';

export const metadata: Metadata = { title: 'Find Product' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN');
const fmtQty = (n: number | string) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

export default async function FindProductPage({
  searchParams,
}: {
  searchParams: { q?: string; item_id?: string; from?: string; to?: string };
}) {
  // Admin only: it shows customer names (Accountant has no customer access) and
  // middleware keeps Staff out of /reports.
  await requireRole('admin');

  const q    = (searchParams.q ?? '').trim();
  const from = searchParams.from && DATE_RE.test(searchParams.from) ? searchParams.from : '';
  const to   = searchParams.to && DATE_RE.test(searchParams.to) ? searchParams.to : '';

  const matches = q ? await searchProducts(q) : [];
  // An explicit pick wins; otherwise a single match is opened directly.
  const itemId =
    searchParams.item_id && UUID_RE.test(searchParams.item_id)
      ? searchParams.item_id
      : matches.length === 1 ? matches[0].id : null;

  const report = itemId
    ? await getProductReport({ itemId, from: from || null, to: to || null })
    : null;

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Find Product
          </nav>
          <h1 className="page-title">Find Product</h1>
        </div>
        {report?.item && (
          <a href={`/api/reports/find-product?${qs({ item_id: report.item.id })}`} className="btn-secondary btn-sm">
            Export CSV
          </a>
        )}
      </div>

      <form method="get" className="card mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Item code, name or sticker code</label>
            <input name="q" defaultValue={q} className="input text-sm w-full" placeholder="e.g. Kurta or STK-00123" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <DatePicker name="from" defaultValue={from} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <DatePicker name="to" defaultValue={to} className="input text-sm" />
          </div>
          <button type="submit" className="btn-primary btn-sm">Search</button>
          <Link href="/reports/find-product" className="btn-ghost btn-sm">Clear</Link>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Retail sales only. Cancelled and draft invoices are excluded. Tailoring orders aren&apos;t linked to stock items, so they don&apos;t appear here.
        </p>
      </form>

      {q && matches.length === 0 && (
        <p className="card text-center text-sm text-gray-400 py-10">No product matches “{q}”.</p>
      )}

      {matches.length > 1 && (
        <div className="card mb-6">
          <p className="mb-3 text-sm font-semibold text-gray-700">{matches.length} products match. Pick one:</p>
          <div className="flex flex-wrap gap-2">
            {matches.map((m) => (
              <Link
                key={m.id}
                href={`/reports/find-product?${qs({ item_id: m.id })}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  m.id === itemId ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 hover:border-purple-400'
                }`}
              >
                {m.name}
                {m.matched_via !== 'name' && <span className="ml-1 text-xs opacity-70">({m.matched_via})</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {report && !report.item && (
        <p className="card text-center text-sm text-gray-400 py-10">Product not found.</p>
      )}

      {report?.item && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            <Link href={`/inventory/items/${report.item.id}`} className="hover:underline">{report.item.name}</Link>
            {(from || to) && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                {from ? fmtDate(from) : 'Start'} – {to ? fmtDate(to) : 'Today'}
              </span>
            )}
          </h2>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
            <div className="card"><p className="text-xs text-gray-500">Units sold</p><p className="text-xl font-bold">{fmtQty(report.totals.sold_qty)}</p></div>
            <div className="card"><p className="text-xs text-gray-500">Sales amount</p><p className="text-xl font-bold text-purple-700">{formatInr(report.totals.sold_amount)}</p></div>
            <div className="card"><p className="text-xs text-gray-500">Returned</p><p className="text-xl font-bold text-red-600">{fmtQty(report.totals.returned_qty)} · {formatInr(report.totals.returned_amount)}</p></div>
            <div className="card"><p className="text-xs text-gray-500">Net</p><p className="text-xl font-bold">{fmtQty(report.totals.sold_qty - report.totals.returned_qty)} · {formatInr(report.totals.sold_amount - report.totals.returned_amount)}</p></div>
          </div>

          {/* Monthly summary */}
          <div className="card p-0 overflow-hidden mb-6">
            <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Monthly summary</h3>
            {report.months.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-gray-400">No sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-y">
                    <tr>
                      <th className="px-4 py-2 text-left">Month</th>
                      <th className="px-4 py-2 text-right">Units sold</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Units returned</th>
                      <th className="px-4 py-2 text-right">Returned amount</th>
                      <th className="px-4 py-2 text-right">Net amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.months.map((m) => (
                      <tr key={m.month}>
                        <td className="px-4 py-2 whitespace-nowrap">{monthLabel(m.month)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtQty(m.sold_qty)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatInr(m.sold_amount)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600">{m.returned_qty ? `-${fmtQty(m.returned_qty)}` : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600">{m.returned_amount ? `-${formatInr(m.returned_amount)}` : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatInr(m.sold_amount - m.returned_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sales */}
          <div className="card p-0 overflow-hidden mb-6">
            <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Sales ({report.sales.length})</h3>
            {report.sales.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-y">
                    <tr>
                      <th className="px-4 py-2 text-left">Invoice</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Month</th>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Rate</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.sales.map((s, i) => (
                      <tr key={`${s.invoice_id}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/billing/invoices/${s.invoice_id}`} className="font-mono text-purple-700 hover:underline">{s.invoice_number}</Link>
                          {s.variant && <div className="text-xs text-gray-400">{s.variant}</div>}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{fmtDate(s.invoice_date)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{monthLabel(s.month)}</td>
                        <td className="px-4 py-2">
                          {s.customer_id
                            ? <Link href={`/customers/${s.customer_id}`} className="text-purple-700 hover:underline">{s.customer_name}</Link>
                            : <span className="text-gray-500">Walk-in</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtQty(s.quantity)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatInr(Number(s.rate))}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatInr(Number(s.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-2" colSpan={4}>Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtQty(report.totals.sold_qty)}</td>
                      <td />
                      <td className="px-4 py-2 text-right tabular-nums">{formatInr(report.totals.sold_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Returns */}
          <div className="card p-0 overflow-hidden">
            <h3 className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-700">Returns / refunds ({report.returns.length})</h3>
            {report.returns.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-gray-400">No returns for this product in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-y">
                    <tr>
                      <th className="px-4 py-2 text-left">Refund</th>
                      <th className="px-4 py-2 text-left">Against invoice</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Customer</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Rate</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.returns.map((r, i) => (
                      <tr key={`${r.credit_note_id}-${i}`} className="hover:bg-gray-50 text-red-700">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Link href={`/billing/credit-notes/${r.credit_note_id}`} className="font-mono hover:underline">{r.credit_note_number}</Link>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {r.invoice_id
                            ? <Link href={`/billing/invoices/${r.invoice_id}`} className="font-mono text-purple-700 hover:underline">{r.invoice_number}</Link>
                            : '—'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{fmtDate(r.return_date)}</td>
                        <td className="px-4 py-2">
                          {r.customer_id
                            ? <Link href={`/customers/${r.customer_id}`} className="text-purple-700 hover:underline">{r.customer_name}</Link>
                            : <span className="text-gray-500">Walk-in</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">-{fmtQty(r.quantity)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatInr(Number(r.rate))}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">-{formatInr(Number(r.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
