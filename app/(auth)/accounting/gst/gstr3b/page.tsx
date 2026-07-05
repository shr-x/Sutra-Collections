import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import MonthSelector from '@/components/month-selector';

export const metadata: Metadata = { title: 'GSTR-3B Summary' };

export default async function Gstr3bPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireRole('accountant', 'admin');

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.month ?? defaultMonth;
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  // Outward supplies (sales)
  const salesRes = await pool.query<{
    total_taxable: string; total_cgst: string; total_sgst: string; total_grand: string;
  }>(
    `SELECT
       COALESCE(SUM(subtotal),0)    AS total_taxable,
       COALESCE(SUM(total_cgst),0)  AS total_cgst,
       COALESCE(SUM(total_sgst),0)  AS total_sgst,
       COALESCE(SUM(grand_total),0) AS total_grand
     FROM invoices
     WHERE status NOT IN ('cancelled','draft')
       AND invoice_date BETWEEN $1 AND $2`,
    [from, to]
  );

  // Credit notes (reduces output tax)
  const cnRes = await pool.query<{ total_taxable: string; total_cgst: string; total_sgst: string; }>(
    `SELECT
       COALESCE(SUM(subtotal),0)   AS total_taxable,
       COALESCE(SUM(total_cgst),0) AS total_cgst,
       COALESCE(SUM(total_sgst),0) AS total_sgst
     FROM credit_notes
     WHERE status IN ('issued','settled')
       AND created_at::date BETWEEN $1 AND $2`,
    [from, to]
  );

  // Input Tax Credit (purchases with include_in_gst=true)
  const itcRes = await pool.query<{ total_cgst: string; total_sgst: string; }>(
    `SELECT
       COALESCE(SUM(total_cgst),0) AS total_cgst,
       COALESCE(SUM(total_sgst),0) AS total_sgst
     FROM purchase_invoices
     WHERE include_in_gst = true
       AND status NOT IN ('cancelled')
       AND purchase_date BETWEEN $1 AND $2`,
    [from, to]
  );

  // Debit notes that reverse ITC (purchase returns with reduces_itc=true)
  const dnItcRes = await pool.query<{ total_cgst: string; total_sgst: string; }>(
    `SELECT
       COALESCE(SUM(total_cgst),0) AS total_cgst,
       COALESCE(SUM(total_sgst),0) AS total_sgst
     FROM debit_notes
     WHERE reduces_itc = true
       AND status = 'issued'
       AND created_at::date BETWEEN $1 AND $2`,
    [from, to]
  );

  const sales = salesRes.rows[0];
  const cn    = cnRes.rows[0];
  const itc   = itcRes.rows[0];
  const dnItc = dnItcRes.rows[0];

  const outTaxable = Number(sales.total_taxable) - Number(cn.total_taxable);
  const outCgst    = Number(sales.total_cgst)    - Number(cn.total_cgst);
  const outSgst    = Number(sales.total_sgst)    - Number(cn.total_sgst);

  // Gross ITC from purchases, then reduce by debit-note reversals
  const grossItcCgst = Number(itc.total_cgst);
  const grossItcSgst = Number(itc.total_sgst);
  const dnCgst = Number(dnItc.total_cgst);
  const dnSgst = Number(dnItc.total_sgst);
  const itcCgst = Math.max(0, grossItcCgst - dnCgst);
  const itcSgst = Math.max(0, grossItcSgst - dnSgst);

  // ── ITC tracing ──────────────────────────────────────────────────────────
  // NOTE: if "Less: Debit Notes" shows ₹0, it's because the debit notes carry
  // gst_rate=0 (no GST recorded on them) — not a query bug. ITC only reduces
  // when the debit note itself has CGST/SGST > 0.
  console.log('[GSTR3B] period', from, '→', to);
  console.log('[GSTR3B] raw debit-note ITC reversal row:', JSON.stringify(dnItc));
  console.log('[GSTR3B] gross ITC  CGST', grossItcCgst, 'SGST', grossItcSgst);
  console.log('[GSTR3B] less DN    CGST', dnCgst, 'SGST', dnSgst);
  console.log('[GSTR3B] net ITC    CGST', itcCgst, 'SGST', itcSgst);

  const netCgst = outCgst - itcCgst;
  const netSgst = outSgst - itcSgst;
  const netTax  = netCgst + netSgst;

  const params = new URLSearchParams({ month });
  const csvUrl = `/api/accounting/gstr3b?${params.toString()}`;
  const pdfUrl = `/api/accounting/gstr3b/pdf?${params.toString()}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">GSTR-3B — Tax Summary</h1>
        <div className="flex flex-wrap gap-2">
          <a href={csvUrl} className="btn-secondary btn-sm">Export CSV</a>
          <a href={`/api/accounting/gstr3b?${params.toString()}&format=json`} className="btn-secondary btn-sm" download>Export JSON</a>
          <a href={pdfUrl} className="btn-secondary btn-sm" download>Export PDF</a>
        </div>
      </div>

      <div className="card mb-6 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500">Period</span>
        <MonthSelector month={month} basePath="/accounting/gst/gstr3b" />
      </div>

      <div className="space-y-6">
        {/* 3.1 Outward Supplies */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
            <h2 className="font-semibold text-blue-800">3.1 — Outward Supplies (Sales)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Description</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Taxable Value</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">CGST</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3 text-gray-700">Taxable outward supplies</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(Number(sales.total_taxable))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(Number(sales.total_cgst))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatInr(Number(sales.total_sgst))}</td>
              </tr>
              {Number(cn.total_taxable) > 0 && (
                <tr className="text-red-600">
                  <td className="px-4 py-3">(Less) Credit Notes</td>
                  <td className="px-4 py-3 text-right tabular-nums">({formatInr(Number(cn.total_taxable))})</td>
                  <td className="px-4 py-3 text-right tabular-nums">({formatInr(Number(cn.total_cgst))})</td>
                  <td className="px-4 py-3 text-right tabular-nums">({formatInr(Number(cn.total_sgst))})</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-blue-50 font-semibold">
              <tr>
                <td className="px-4 py-3 text-blue-800">Net Outward (A)</td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-800">{formatInr(outTaxable)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-800">{formatInr(outCgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-800">{formatInr(outSgst)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ITC */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 px-4 py-3">
            <h2 className="font-semibold text-green-800">4 — Input Tax Credit (ITC)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Description</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">CGST</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3 text-gray-700">ITC Available (Purchases with GST)</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatInr(grossItcCgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatInr(grossItcSgst)}</td>
              </tr>
              {(dnCgst > 0 || dnSgst > 0) && (
                <tr className="text-red-600">
                  <td className="px-4 py-3">(Less) Debit Notes</td>
                  <td className="px-4 py-3 text-right tabular-nums">({formatInr(dnCgst)})</td>
                  <td className="px-4 py-3 text-right tabular-nums">({formatInr(dnSgst)})</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-green-50 font-semibold">
              <tr>
                <td className="px-4 py-3 text-green-800">Net ITC (B)</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-800">{formatInr(itcCgst)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-800">{formatInr(itcSgst)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Net Tax Payable */}
        <div className={`rounded-xl border-2 p-5 ${netTax > 0 ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'}`}>
          <h2 className="font-bold text-gray-800 mb-3">5 — Net Tax Payable (A − B)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">CGST Payable</p>
              <p className={`text-lg font-bold mt-0.5 ${netCgst > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {formatInr(Math.max(0, netCgst))}
              </p>
              {netCgst < 0 && <p className="text-xs text-green-600">Credit: {formatInr(-netCgst)}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500">SGST Payable</p>
              <p className={`text-lg font-bold mt-0.5 ${netSgst > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {formatInr(Math.max(0, netSgst))}
              </p>
              {netSgst < 0 && <p className="text-xs text-green-600">Credit: {formatInr(-netSgst)}</p>}
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Tax Payable</p>
              <p className={`text-xl font-bold mt-0.5 ${netTax > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {formatInr(Math.max(0, netTax))}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Note: Generate and file GSTR-3B on the GST Portal. This is a summary only.
          </p>
        </div>
      </div>
    </div>
  );
}
