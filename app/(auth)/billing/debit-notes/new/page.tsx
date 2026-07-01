import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import DebitNoteForm from './debit-note-form';
import { createDebitNoteAction } from '../actions';

export const metadata: Metadata = { title: 'New Debit Note' };

export default async function NewDebitNotePage() {
  const session = await requireRole('admin');

  const [suppliersRes, warehousesRes] = await Promise.all([
    query('SELECT id, name FROM suppliers ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
  ]);

  const defaultWarehouseId = session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Debit Note</h1>
      </div>
      <DebitNoteForm
        action={createDebitNoteAction}
        suppliers={suppliersRes.rows as never}
        warehouses={warehousesRes.rows as never}
        defaultWarehouseId={defaultWarehouseId || null}
      />
    </div>
  );
}
