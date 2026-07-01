import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditTailoringForm from './_form';

interface OrderRow {
  id: string;
  order_number: string;
  stage: string;
  price: string;
  due_date: string | null;
  color_fabric: string | null;
  notes: string | null;
  tailor_id: string | null;
}

interface TailorRow {
  id: string;
  name: string;
}

export default async function EditTailoringPage({ params }: { params: { id: string } }) {
  await requireSA();

  const [orderRes, tailorsRes] = await Promise.all([
    query<OrderRow>(
      `SELECT id, order_number, stage, price::text, due_date::text, color_fabric, notes, tailor_id
       FROM tailoring_orders WHERE id=$1`,
      [params.id]
    ),
    query<TailorRow>('SELECT id, name FROM tailors WHERE is_active=TRUE ORDER BY name'),
  ]);

  const order = orderRes.rows[0];
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit Order</h1>
        <Link
          href="/sa-console-x7k2/tailoring"
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back
        </Link>
      </div>
      <p className="font-mono text-sm text-gray-500">{order.order_number}</p>
      <EditTailoringForm order={order} tailors={tailorsRes.rows} />
    </div>
  );
}
