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
  const [scopeTab, setScopeTab] = useState<'items' | 'categories'>('items');
  const [scopeSearch, setScopeSearch] = useState('');

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const activeOptions = scopeTab === 'items' ? items : categories;
  const activeSelectedIds = scopeTab === 'items' ? scopedItemIds : scopedCategoryIds;
  const setActiveSelectedIds = scopeTab === 'items' ? setScopedItemIds : setScopedCategoryIds;
  const filteredOptions = activeOptions.filter((o) =>
    o.name.toLowerCase().includes(scopeSearch.trim().toLowerCase())
  );
  const selectedOptions = activeOptions.filter((o) => activeSelectedIds.includes(o.id));
  const totalScoped = scopedItemIds.length + scopedCategoryIds.length;

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
          Restrict this scheme to specific items or categories. Leave empty to apply it to <strong>all items</strong>.
        </p>
        {scopedItemIds.map((id) => <input key={id} type="hidden" name="item_ids" value={id} />)}
        {scopedCategoryIds.map((id) => <input key={id} type="hidden" name="category_ids" value={id} />)}

        {/* Tabs */}
        <div className="mb-3 flex gap-1 border-b border-gray-200">
          {(['items', 'categories'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setScopeTab(tab); setScopeSearch(''); }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                scopeTab === tab
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'items' ? 'Items' : 'Categories'}
              {(tab === 'items' ? scopedItemIds.length : scopedCategoryIds.length) > 0 && (
                <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-700">
                  {tab === 'items' ? scopedItemIds.length : scopedCategoryIds.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Selected chips (active tab) */}
        {selectedOptions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedOptions.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 py-1 pl-2.5 pr-1.5 text-xs font-medium text-purple-700"
              >
                {o.name}
                <button
                  type="button"
                  onClick={() => toggleId(activeSelectedIds, setActiveSelectedIds, o.id)}
                  className="rounded-full text-purple-400 hover:text-purple-800"
                  aria-label={`Remove ${o.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={scopeSearch}
          onChange={(e) => setScopeSearch(e.target.value)}
          placeholder={`Search ${scopeTab}…`}
          className="input mb-2 text-sm"
          autoComplete="off"
        />

        {/* Filtered list */}
        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
          {activeOptions.length === 0 ? (
            <p className="p-3 text-center text-xs text-gray-400">No {scopeTab} available.</p>
          ) : filteredOptions.length === 0 ? (
            <p className="p-3 text-center text-xs text-gray-400">No {scopeTab} match &quot;{scopeSearch}&quot;.</p>
          ) : (
            filteredOptions.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={activeSelectedIds.includes(o.id)}
                  onChange={() => toggleId(activeSelectedIds, setActiveSelectedIds, o.id)}
                  className="h-3.5 w-3.5"
                />
                {o.name}
              </label>
            ))
          )}
        </div>

        {totalScoped === 0 && (
          <p className="mt-2 text-xs font-medium text-amber-600">
            ⚠ No items or categories selected — this scheme applies to ALL items.
          </p>
        )}
      </div>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary">Save Scheme</button>
      </div>
    </form>
  );
}
