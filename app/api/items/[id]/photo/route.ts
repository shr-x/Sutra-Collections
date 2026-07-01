import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('photo') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a JPG, PNG, or WebP image' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large — max 5 MB' }, { status: 400 });
  }

  const ext = extname(file.name).toLowerCase() || '.jpg';
  const filename = `${params.id}${ext}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'items');

  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), buffer);

  const photoUrl = `/uploads/items/${filename}`;
  await query('UPDATE items SET photo_url=$1 WHERE id=$2', [photoUrl, params.id]);

  return NextResponse.json({ url: photoUrl });
}
