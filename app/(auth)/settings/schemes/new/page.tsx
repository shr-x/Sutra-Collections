import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import SchemeForm from '../scheme-form';
import { createSchemeAction } from '../actions';

export const metadata: Metadata = { title: 'New Discount Scheme' };

export default async function NewSchemePage() {
  await requireRole('admin');
  const itemsRes = await query('SELECT id, name FROM items WHERE is_active=TRUE ORDER BY name');
  return (
    <div>
      <div className="page-header"><h1 className="page-title">New Discount Scheme</h1></div>
      <SchemeForm action={createSchemeAction} items={itemsRes.rows as { id: string; name: string }[]} />
    </div>
  );
}
