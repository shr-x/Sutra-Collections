import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditSchemeForm from './_form';

interface SchemeRow {
  id: string;
  name: string;
  scheme_type: string;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  buy_quantity: string | null;
  get_quantity: string | null;
  discount_value: string | null;
  min_order_value: string | null;
}

export default async function EditSchemePage({ params }: { params: { id: string } }) {
  await requireSA();

  const { rows } = await query<SchemeRow>(
    `SELECT id, name, scheme_type, is_active,
            valid_from::text, valid_until::text,
            buy_quantity::text, get_quantity::text,
            discount_value::text, min_order_value::text
     FROM discount_schemes WHERE id=$1`,
    [params.id]
  );

  const scheme = rows[0];
  if (!scheme) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit Scheme</h1>
        <Link href="/sa-console-x7k2/schemes" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>
      <EditSchemeForm scheme={scheme} />
    </div>
  );
}
