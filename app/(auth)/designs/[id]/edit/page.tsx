import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import EditDesignForm from './edit-design-form';

export const metadata: Metadata = { title: 'Edit Design' };

export default async function EditDesignPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const { rows } = await query(
    'SELECT id, name, category, description, photo_path, gst_rate::numeric AS gst_rate FROM designs WHERE id=$1',
    [params.id]
  );
  if (!rows[0]) notFound();
  const raw = rows[0] as { id: string; name: string; category: string | null; description: string | null; photo_path: string | null; gst_rate: string };
  const d = { ...raw, gst_rate: Number(raw.gst_rate) };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/designs/${d.id}`} className="text-sm text-purple-600 hover:underline">
            ← {d.name}
          </Link>
          <h1 className="page-title mt-1">Edit Design</h1>
        </div>
      </div>
      <div className="max-w-xl">
        <EditDesignForm design={d} />
      </div>
    </div>
  );
}
