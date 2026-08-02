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
  is_active?: boolean; offer_image_path?: string | null; broadcast_sent_at?: string | null;
}

interface Props {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  items: ItemOpt[];
  categories?: CategoryOpt[];
  initialData?: SchemeData;
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-0.5 mb-4 text-sm text-gray-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
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

  // Default a NEW scheme to Active; an existing one reflects its saved state.
  const isNew = initialData === undefined;
  const [status, setStatus] = useState(isNew ? 'active' : (initialData?.is_active ? 'active' : 'draft'));

  // Once a broadcast has gone out, this is a done deal — show a status line,
  // not a checkbox that resets to unchecked on every page load (which is what
  // made it look like it was "un-checking itself").
  const alreadyBroadcast = Boolean(initialData?.broadcast_sent_at);
  // Broadcast controls (image + toggle) are hidden until the admin actually
  // checks the box, instead of always showing on every scheme. Only relevant
  // when a broadcast hasn't already gone out (see alreadyBroadcast branch
  // below) — always starts closed so a leftover image from a prior edit
  // can't silently pre-check "send" on the next save.
  const [wantsBroadcast, setWantsBroadcast] = useState(false);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-6">
      {state.error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>}

      <SectionCard title="Discount Details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Offer Name *</label>
            <input name="name" type="text" className="input" value={schemeName} onChange={(e) => setSchemeName(e.target.value)} required maxLength={255} placeholder="e.g. Summer Buy-2-Get-1" autoComplete="off" />
          </div>
          <div>
            <label className="label">Discount Type</label>
            <select name="scheme_type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="buy_x_get_y">Buy X Get Y Free</option>
              <option value="flat">Flat Amount Off (₹)</option>
              <option value="percent">Percentage Off (%)</option>
              <option value="seasonal">Seasonal / Other</option>
            </select>
          </div>

          {type === 'buy_x_get_y' && (
            <>
              <div>
                <label className="label">Buy This Item</label>
                <select name="buy_item_id" className="input" defaultValue={initialData?.buy_item_id ?? ''}>
                  <option value="">Any item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Quantity to Buy</label>
                <input name="buy_quantity" type="number" className="input" defaultValue={initialData?.buy_quantity} min="1" step="0.001" />
              </div>
              <div>
                <label className="label">Get This Item Free</label>
                <select name="get_item_id" className="input" defaultValue={initialData?.get_item_id ?? ''}>
                  <option value="">Same as the item bought</option>
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
              <label className="label">Discount Amount {type === 'flat' ? '(₹)' : '(%)'}</label>
              <input name="discount_value" type="number" className="input" defaultValue={initialData?.discount_value} min="0" step="0.01" />
              {type === 'seasonal' && (
                <p className="mt-1 text-xs text-gray-400">Applied as a percentage off, same as Percentage Off.</p>
              )}
            </div>
          )}

          <div>
            <label className="label">Minimum Order Amount (₹)</label>
            <input name="min_order_value" type="number" className="input" defaultValue={initialData?.min_order_value} min="0" step="0.01" placeholder="Leave blank for no minimum" />
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="draft">Draft — not usable yet</option>
              <option value="active">Active — customers can use it now</option>
            </select>
          </div>
          <div>
            <label className="label">Starts On <span className="font-normal text-gray-400">(optional)</span></label>
            <DatePicker name="valid_from" className="input" defaultValue={initialData?.valid_from} />
          </div>
          <div>
            <label className="label">Ends On <span className="font-normal text-gray-400">(optional)</span></label>
            <DatePicker name="valid_until" className="input" defaultValue={initialData?.valid_until} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Applies To"
        subtitle={`Restrict this offer to specific items or categories. Leave empty to apply it to all items.`}
      >
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
            ⚠ No items or categories selected — this offer applies to ALL items.
          </p>
        )}
      </SectionCard>

      {/* ── Broadcast to Customers ────────────────────────────────────────── */}
      <SectionCard
        title="Broadcast to Customers"
        subtitle="Optional — send this offer to customers over WhatsApp."
      >
        {alreadyBroadcast ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              ✓ Broadcast sent on {new Date(initialData!.broadcast_sent_at!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <p className="mt-1 text-xs text-green-700">
              This offer has already been sent to customers and won&apos;t be sent again, even if you change and save it.
            </p>
            {initialData?.offer_image_path && (
              <img
                src={`/${initialData.offer_image_path}`}
                alt="Broadcast banner sent"
                className="mt-3 h-20 w-auto rounded border border-green-200 object-contain"
              />
            )}
          </div>
        ) : (
          <>
            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={wantsBroadcast}
                onChange={(e) => setWantsBroadcast(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600"
              />
              <span>
                <span className="font-medium text-gray-900">Notify customers about this offer via WhatsApp</span>
                <span className="block text-xs text-gray-400">
                  Sends a message with a banner image to every customer who hasn&apos;t opted out of marketing messages.
                </span>
              </span>
            </label>

            {wantsBroadcast && (
              <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div>
                  <label className="label">Banner Image *</label>
                  {initialData?.offer_image_path && (
                    <img
                      src={`/${initialData.offer_image_path}?v=${encodeURIComponent(initialData.offer_image_path)}`}
                      alt="Current offer banner"
                      className="mb-2 h-20 w-auto rounded border border-gray-200 object-contain"
                    />
                  )}
                  <input
                    type="file"
                    name="offer_image"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
                  />
                  <p className="mt-1 text-xs text-gray-400">PNG, JPG, GIF or WebP · Max 5 MB · Shown as the picture in the WhatsApp message</p>
                </div>

                <input type="hidden" name="send_broadcast" value="on" />

                {status !== 'active' ? (
                  <p className="text-xs font-medium text-amber-600">
                    ⚠ This offer is still a Draft — nothing will be sent until you set Status to Active above and save.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Saving with Status set to Active will send this to customers right away.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </SectionCard>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary">Save Offer</button>
      </div>
    </form>
  );
}
