import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import OrderWizard from './order-wizard';

export const metadata: Metadata = { title: 'New Tailoring Order' };

export default async function NewTailoringOrderPage({
  searchParams,
}: {
  searchParams: { design?: string };
}) {
  await requireRole('admin', 'staff');

  const [designsRes, customersRes] = await Promise.all([
    query(
      `SELECT d.id, d.name, d.category, d.photo_path,
              json_agg(
                json_build_object(
                  'id',         f.id,
                  'field_name', f.field_name,
                  'field_type', f.field_type,
                  'unit',       f.unit,
                  'sort_order', f.sort_order
                ) ORDER BY f.sort_order, f.field_name
              ) FILTER (WHERE f.id IS NOT NULL) AS fields
       FROM designs d
       LEFT JOIN design_measurement_fields f ON f.design_id = d.id
       GROUP BY d.id
       ORDER BY d.name`
    ),
    query(
      `SELECT id, name, phone FROM customers
       WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL
       ORDER BY name
       LIMIT 500`
    ),
  ]);

  type DesignRow = { id: string; name: string; category: string | null; photo_path: string | null; fields: Array<{ id: string; field_name: string; field_type: 'number' | 'text'; unit: string | null; sort_order: number }> | null };
  const designs = (designsRes.rows as DesignRow[]).map((d) => ({
    id:         d.id,
    name:       d.name,
    category:   d.category,
    photo_path: d.photo_path,
    fields:     d.fields ?? [],
  }));
  type CustomerRow = { id: string; name: string; phone: string | null };
  const customers = customersRes.rows as CustomerRow[];

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/tailoring" className="text-sm text-purple-600 hover:underline">
            ← Tailoring Orders
          </Link>
          <h1 className="page-title mt-1">New Tailoring Order</h1>
        </div>
      </div>

      <OrderWizard
        designs={designs}
        customers={customers}
        initialDesignId={searchParams.design}
      />
    </div>
  );
}
