import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import QRCode from 'qrcode';

export async function GET(req: NextRequest, { params }: { params: { sku: string } }) {
  const cookie = req.cookies.get('sutra_session')?.value;
  if (!cookie) return new NextResponse('Unauthorized', { status: 401 });
  const session = await verifySession(cookie).catch(() => null);
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const { sku } = params;
  if (!sku) return new NextResponse('SKU required', { status: 400 });

  // Generate QR code as SVG for the SKU string (acts as a barcode alternative)
  const svg = await QRCode.toString(sku, { type: 'svg', margin: 1, width: 200 });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
