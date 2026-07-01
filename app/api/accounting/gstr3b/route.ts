import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month') ?? '';
  const [y, m] = (month || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const [salesRes, cnRes, itcRes, dnItcRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(total_cgst),0) AS cgst, COALESCE(SUM(total_sgst),0) AS sgst
       FROM invoices WHERE status NOT IN ('cancelled','draft') AND invoice_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(total_cgst),0) AS cgst, COALESCE(SUM(total_sgst),0) AS sgst
       FROM credit_notes WHERE status IN ('issued','settled') AND created_at::date BETWEEN $1 AND $2`,
      [from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_cgst),0) AS cgst, COALESCE(SUM(total_sgst),0) AS sgst
       FROM purchase_invoices WHERE include_in_gst=true AND status NOT IN ('cancelled') AND purchase_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    // Debit notes with reduces_itc reduce ITC available
    pool.query(
      `SELECT COALESCE(SUM(total_cgst),0) AS cgst, COALESCE(SUM(total_sgst),0) AS sgst
       FROM debit_notes WHERE reduces_itc=true AND status='issued' AND created_at::date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ]);

  const s = salesRes.rows[0];
  const cn = cnRes.rows[0];
  const itc = itcRes.rows[0];
  const dnItc = dnItcRes.rows[0];

  const outCgst = Number(s.cgst) - Number(cn.cgst);
  const outSgst = Number(s.sgst) - Number(cn.sgst);

  // ITC available = purchases GST - debit note reversals
  const itcCgst = Math.max(0, Number(itc.cgst) - Number(dnItc.cgst));
  const itcSgst = Math.max(0, Number(itc.sgst) - Number(dnItc.sgst));

  const netCgst = outCgst - itcCgst;
  const netSgst = outSgst - itcSgst;

  const rawItcCgst = Number(itc.cgst);
  const rawItcSgst = Number(itc.sgst);
  const dnCgst = Number(dnItc.cgst);
  const dnSgst = Number(dnItc.sgst);

  const format = req.nextUrl.searchParams.get('format');

  if (format === 'json') {
    const json = {
      period: { from, to, month },
      outward_supplies: {
        taxable_value: Number(s.taxable) - Number(cn.taxable),
        cgst: outCgst, sgst: outSgst, total: outCgst + outSgst,
      },
      itc: {
        gross_cgst: rawItcCgst, gross_sgst: rawItcSgst,
        debit_note_cgst: dnCgst, debit_note_sgst: dnSgst,
        net_cgst: itcCgst, net_sgst: itcSgst,
      },
      net_tax_payable: {
        cgst: Math.max(0, netCgst), sgst: Math.max(0, netSgst),
        total: Math.max(0, netCgst + netSgst),
      },
    };
    return new NextResponse(JSON.stringify(json, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="GSTR3B_${month}.json"`,
      },
    });
  }

  const rows = [
    ['Section', 'Description', 'Taxable Value', 'CGST', 'SGST', 'Total GST'],
    ['3.1', 'Outward Taxable Supplies', (Number(s.taxable) - Number(cn.taxable)).toFixed(2), outCgst.toFixed(2), outSgst.toFixed(2), (outCgst + outSgst).toFixed(2)],
    ['4a', 'ITC Available (from Purchases)', '', rawItcCgst.toFixed(2), rawItcSgst.toFixed(2), (rawItcCgst + rawItcSgst).toFixed(2)],
    ['4b', 'Less: Debit Notes (reduces_itc=true)', '', (-dnCgst).toFixed(2), (-dnSgst).toFixed(2), (-(dnCgst + dnSgst)).toFixed(2)],
    ['4c', 'Net ITC Available', '', itcCgst.toFixed(2), itcSgst.toFixed(2), (itcCgst + itcSgst).toFixed(2)],
    ['5', 'Net Tax Payable', '', Math.max(0, netCgst).toFixed(2), Math.max(0, netSgst).toFixed(2), Math.max(0, netCgst + netSgst).toFixed(2)],
  ];

  return new NextResponse(rows.map((r) => r.join(',')).join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="GSTR3B_${month}.csv"`,
    },
  });
}
