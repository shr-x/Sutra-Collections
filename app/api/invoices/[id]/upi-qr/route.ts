import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { query } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await query<{ grand_total: string; amount_paid: string; invoice_number: string }>(
    `SELECT grand_total, amount_paid, invoice_number FROM invoices WHERE id=$1`,
    [params.id]
  );
  if (!res.rows[0]) return new NextResponse('Not found', { status: 404 });

  const inv     = res.rows[0];
  const balance = Math.max(0, Number(inv.grand_total) - Number(inv.amount_paid));
  const vpa     = process.env.UPI_VPA ?? 'sutra@upi';

  const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&am=${balance.toFixed(2)}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;

  const svg = await QRCode.toString(upiUri, { type: 'svg', width: 200 });

  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
  });
}
