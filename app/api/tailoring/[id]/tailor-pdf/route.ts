import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { requireRole } from '@/lib/auth';
import { generateTailoringTailorPdf } from '@/lib/pdf-generator';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pdfPath = await generateTailoringTailorPdf(params.id).catch(() => null);
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return NextResponse.json({ error: 'PDF not available' }, { status: 404 });
  }

  const buffer = fs.readFileSync(pdfPath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="tailor_${params.id}.pdf"`,
    },
  });
}
