'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import type { MovementState } from './actions';
import type { Warehouse, ItemVariant } from '@/types';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Recording…' : 'Record Movement'}
    </button>
  );
}

interface ItemWithVariants {
  id: string;
  name: string;
  unit: string;
  item_type: string;
  variants: ItemVariant[];
}

interface Props {
  action: (prev: MovementState | null, data: FormData) => Promise<MovementState>;
  items: ItemWithVariants[];
  warehouses: Warehouse[];
  defaultWarehouseId?: string | null;
  staffLocked: boolean; // staff can only use their warehouse
}

const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Stock In — Purchase',
  adjustment_in: 'Stock In — Adjustment',
  sale: 'Stock Out — Sale (manual)',
  adjustment_out: 'Stock Out — Adjustment',
  transfer: 'Transfer Between Warehouses',
};

export default function MovementForm({ action, items, warehouses, defaultWarehouseId, staffLocked }: Props) {
  const [state, formAction] = useFormState(action, null);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [movementType, setMovementType] = useState('purchase');

  const selectedItem = items.find((i) => i.id === selectedItemId);
  const isTransfer = movementType === 'transfer';

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">Movement recorded successfully.</p>
      )}

      <div>
        <label className="label mb-1">Movement Type *</label>
        <select
          name="movement_type"
          className="input"
          value={movementType}
          onChange={(e) => setMovementType(e.target.value)}
          required
        >
          {Object.entries(MOVEMENT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label mb-1">Item *</label>
        <select
          name="item_id"
          className="input"
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          required
        >
          <option value="">— Select item —</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {selectedItem && selectedItem.variants.length > 0 && (
        <div>
          <label className="label mb-1">Variant</label>
          <select name="variant_id" className="input">
            <option value="">— All / No variant —</option>
            {selectedItem.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.sku, v.color, v.size].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={isTransfer ? 'grid grid-cols-2 gap-4' : ''}>
        <div>
          <label className="label mb-1">{isTransfer ? 'From Warehouse *' : 'Warehouse *'}</label>
          {staffLocked ? (
            <>
              <input type="hidden" name="warehouse_id" value={defaultWarehouseId ?? ''} />
              <p className="text-sm text-gray-600">
                {warehouses.find((w) => w.id === defaultWarehouseId)?.name ?? 'Your warehouse'}
              </p>
            </>
          ) : (
            <select name="warehouse_id" className="input" defaultValue={defaultWarehouseId ?? ''} required>
              <option value="">— Select warehouse —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>

        {isTransfer && (
          <div>
            <label className="label mb-1">To Warehouse *</label>
            <select name="to_warehouse_id" className="input" required>
              <option value="">— Select warehouse —</option>
              {warehouses
                .filter((w) => w.id !== defaultWarehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="label mb-1">
          Quantity *
          {selectedItem && <span className="ml-1 font-normal text-gray-400">({selectedItem.unit})</span>}
        </label>
        <input
          name="quantity"
          type="number"
          min="0.001"
          step="0.001"
          className="input"
          required
          placeholder="0"
        />
      </div>

      <div>
        <label className="label mb-1">Reason / Notes</label>
        <input name="reason" className="input" placeholder="e.g. Monthly stock count adjustment" />
      </div>

      <Submit />
    </form>
  );
}
