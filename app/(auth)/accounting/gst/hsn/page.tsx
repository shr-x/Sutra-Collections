import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import MonthSelector from '@/components/month-selector';

export const metadata: Metadata = { title: 'HSN Summary' };

interface HsnRow {
  hsn_code: string;
  gst_rate: number;
  total_qty: number;
  total_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_amount: number;
}

export default async function HsnPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireRole('accountant', 'admin');

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.month ?? defaultMonth;
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const res = await pool.query<HsnRow>(
    `SELECT
       COALESCE(ii.hsn_code, 'N/A') AS hsn_code,
       ii.gst_rate,
       SUM(ii.quantity)::numeric        AS total_qty,
       SUM(ii.taxable_value)            AS total_taxable,
       SUM(ii.cgst_amount)              AS total_cgst,
       SUM(ii.sgst_amount)              AS total_sgst,
       SUM(ii.total_amount)             AS total_amount
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_date BETWEEN $1 AND $2
     GROUP BY ii.hsn_code, ii.gst_rate
     ORDER BY total_amount DESC`,
    [from, to]
  );

  const rows = res.rows.map((r) => ({
    ...r,
    gst_rate:      Number(r.gst_rate),
    total_qty:     Number(r.total_qty),
    total_taxable: Number(r.total_taxable),
    total_cgst:    Number(r.total_cgst),
    total_sgst:    Number(r.total_sgst),
    total_amount:  Number(r.total_amount),
  }));

  const grand = rows.reduce(
    (s, r) => ({ taxable: s.taxable + r.total_taxable, cgst: s.cgst + r.total_cgst, sgst: s.sgst + r.total_sgst, total: s.total + r.total_amount }),
    { taxable: 0, cgst: 0, sgst: 0, total: 0 }
  );

  const params = new URLSearchParams({ month });
  const csvUrl = `/api/accounting/hsn?${params.toString()}`;
  const pdfUrl = `/api/accounting/hsn/pdf?${params.toString()}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">HSN-wise Summary</h1>
        <div className="flex gap-2">
          <a href={csvUrl} className="btn-secondary">Export CSV</a>
          <a href={pdfUrl} className="btn-secondary" download>Export PDF</a>
        </div>
      </div>

      <div className="card mb-4 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500">Period</span>
        <MonthSelector month={month} basePath="/accounting/gst/hsn" />
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">HSN Code</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">GST Rate</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Quantity</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Taxable Value</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">CGST</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">SGST</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No data for this period.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm font-medium text-gray-800">{row.hsn_code}</td>
                <td className="px-4 py-3 text-right text-gray-600">{row.gst_rate}%</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{row.total_qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.total_taxable)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.total_cgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(row.total_sgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatInr(row.total_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td colSpan={3} className="px-4 py-3">Total ({rows.length} HSN codes)</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(grand.taxable)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(grand.cgst)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(grand.sgst)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatInr(grand.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
