import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import MonthSelector from '@/components/month-selector';

export const metadata: Metadata = { title: 'GSTR-1' };

interface InvoiceRow {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  gstin: string | null;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
}

export default async function Gstr1Page({ searchParams }: { searchParams: { month?: string } }) {
  await requireRole('accountant', 'admin');

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.month ?? defaultMonth;

  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const res = await pool.query<InvoiceRow>(
    `SELECT i.invoice_number, i.invoice_date,
            COALESCE(i.customer_name_snapshot, c.name, 'Walk-in') AS customer_name,
            COALESCE(i.customer_gstin_snapshot, c.gstin) AS gstin,
            i.subtotal, i.total_cgst, i.total_sgst, i.grand_total
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_date BETWEEN $1 AND $2
     ORDER BY i.invoice_date, i.invoice_number`,
    [from, to]
  );

  const rows = res.rows.map((r) => ({
    ...r,
    subtotal:    Number(r.subtotal),
    total_cgst:  Number(r.total_cgst),
    total_sgst:  Number(r.total_sgst),
    grand_total: Number(r.grand_total),
  }));

  const totals = rows.reduce(
    (s, r) => ({
      taxable: s.taxable + r.subtotal,
      cgst:    s.cgst    + r.total_cgst,
      sgst:    s.sgst    + r.total_sgst,
      total:   s.total   + r.grand_total,
    }),
    { taxable: 0, cgst: 0, sgst: 0, total: 0 }
  );

  const params = new URLSearchParams({ month });
  const csvUrl = `/api/accounting/gstr1?${params.toString()}`;
  const pdfUrl = `/api/accounting/gstr1/pdf?${params.toString()}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">GSTR-1 — Sales Register</h1>
        <div className="flex flex-wrap gap-2">
          <a href={csvUrl} className="btn-secondary btn-sm">Export CSV</a>
          <a href={`/api/accounting/gstr1?${params.toString()}&format=json`} className="btn-secondary btn-sm" download>Export JSON</a>
          <a href={pdfUrl} className="btn-secondary btn-sm" download>Export PDF</a>
        </div>
      </div>

      <div className="card mb-4 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500">Period</span>
        <MonthSelector month={month} basePath="/accounting/gst/gstr1" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          ['Taxable Value', totals.taxable],
          ['CGST', totals.cgst],
          ['SGST', totals.sgst],
          ['Total Tax', totals.cgst + totals.sgst],
        ].map(([label, val]) => (
          <div key={label as string} className="card py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{formatInr(val as number)}</p>
          </div>
        ))}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="min-w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 sticky left-0 z-10 bg-gray-50">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Invoice No.</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">GSTIN</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Taxable</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">CGST</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">SGST</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No invoices in this period.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.invoice_number} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 text-xs sticky left-0 z-10 bg-white">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{row.invoice_number}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(row.invoice_date).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3 text-gray-700">{row.customer_name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.gstin ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.subtotal)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.total_cgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.total_sgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatInr(row.grand_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td colSpan={5} className="px-4 py-3">{rows.length} invoices</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(totals.taxable)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(totals.cgst)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(totals.sgst)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
