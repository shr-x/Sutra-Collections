'use client';

import DatePicker from '@/components/date-picker';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import type { ActionResult } from '@/types';

interface ItemOpt { id: string; name: string }
interface CategoryOpt { id: string; name: string }
interface SchemeData {
  name?: string; scheme_type?: string;
  buy_item_id?: string; buy_quantity?: number;
  get_item_id?: string; get_quantity?: number;
  discount_value?: number; min_order_value?: number;
  valid_from?: string; valid_until?: string;
  item_ids?: string[]; category_ids?: string[];
}

interface Props {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  items: ItemOpt[];
  categories?: CategoryOpt[];
  initialData?: SchemeData;
}

export default function SchemeForm({ action, items, categories = [], initialData }: Props) {
  const [state, formAction] = useFormState<ActionResult, FormData>(action, { success: false });
  const [type, setType] = useState(initialData?.scheme_type ?? 'buy_x_get_y');
  const [schemeName, setSchemeName] = useState(initialData?.name ?? '');
  const [scopedItemIds, setScopedItemIds] = useState<string[]>(initialData?.item_ids ?? []);
  const [scopedCategoryIds, setScopedCategoryIds] = useState<string[]>(initialData?.category_ids ?? []);

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <form action={formAction} className="space-y-6">
      {state.error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>}

      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Scheme Name *</label>
            <input name="name" type="text" className="input" value={schemeName} onChange={(e) => setSchemeName(e.target.value)} required maxLength={255} placeholder="e.g. Summer Buy-2-Get-1" autoComplete="off" />
          </div>
          <div>
            <label className="label">Scheme Type</label>
            <select name="scheme_type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="buy_x_get_y">Buy X Get Y</option>
              <option value="flat">Flat Discount (₹)</option>
              <option value="percent">Percent Discount (%)</option>
              <option value="seasonal">Seasonal / Other</option>
            </select>
          </div>

          {type === 'buy_x_get_y' && (
            <>
              <div>
                <label className="label">Buy Item</label>
                <select name="buy_item_id" className="input" defaultValue={initialData?.buy_item_id ?? ''}>
                  <option value="">Any item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Buy Quantity</label>
                <input name="buy_quantity" type="number" className="input" defaultValue={initialData?.buy_quantity} min="1" step="0.001" />
              </div>
              <div>
                <label className="label">Get Item (free)</label>
                <select name="get_item_id" className="input" defaultValue={initialData?.get_item_id ?? ''}>
                  <option value="">Same item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Free Quantity</label>
                <input name="get_quantity" type="number" className="input" defaultValue={initialData?.get_quantity} min="1" step="0.001" />
              </div>
            </>
          )}

          {(type === 'flat' || type === 'percent' || type === 'seasonal') && (
            <div>
              <label className="label">Discount Value {type === 'flat' ? '(₹)' : '(%)'}</label>
              <input name="discount_value" type="number" className="input" defaultValue={initialData?.discount_value} min="0" step="0.01" />
              {type === 'seasonal' && (
                <p className="mt-1 text-xs text-gray-400">Applied as a percentage off, same as a Percent Discount scheme.</p>
              )}
            </div>
          )}

          <div>
            <label className="label">Min Order Value (₹)</label>
            <input name="min_order_value" type="number" className="input" defaultValue={initialData?.min_order_value} min="0" step="0.01" placeholder="0 = no minimum" />
          </div>
          <div>
            <label className="label">Valid From</label>
            <DatePicker name="valid_from" className="input" defaultValue={initialData?.valid_from} />
          </div>
          <div>
            <label className="label">Valid Until</label>
            <DatePicker name="valid_until" className="input" defaultValue={initialData?.valid_until} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-gray-900">Applies To</h2>
        <p className="mb-3 text-xs text-gray-500">
          Restrict this scheme to specific items or categories. Leave both empty to apply it to all items.
        </p>
        {scopedItemIds.map((id) => <input key={id} type="hidden" name="item_ids" value={id} />)}
        {scopedCategoryIds.map((id) => <input key={id} type="hidden" name="category_ids" value={id} />)}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Specific Items</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400">No items available.</p>
              ) : items.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={scopedItemIds.includes(i.id)}
                    onChange={() => toggleId(scopedItemIds, setScopedItemIds, i.id)}
                    className="h-3.5 w-3.5"
                  />
                  {i.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Categories</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
              {categories.length === 0 ? (
                <p className="text-xs text-gray-400">No categories available.</p>
              ) : categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={scopedCategoryIds.includes(c.id)}
                    onChange={() => toggleId(scopedCategoryIds, setScopedCategoryIds, c.id)}
                    className="h-3.5 w-3.5"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary">Save Scheme</button>
      </div>
    </form>
  );
}
