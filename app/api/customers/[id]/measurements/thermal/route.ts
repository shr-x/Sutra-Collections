import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { generateCustomerMeasurementsThermalPdf } from '@/lib/pdf-generator';

// Latest measurement version for every design the customer has, on one
// thermal-width PDF. Same access as the per-version thermal download.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await generateCustomerMeasurementsThermalPdf(params.id).catch((err) => {
    console.error('[customers/measurements/thermal]', err);
    return null;
  });
  if (!result) {
    return NextResponse.json({ error: 'No measurements found for this customer' }, { status: 404 });
  }

  const slug = result.customerName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'customer';
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="measurements_${slug}_${date}.pdf"`,
    },
  });
}
