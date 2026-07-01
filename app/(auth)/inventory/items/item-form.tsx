'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ItemState } from './actions';
import type { Item, ItemCategory, ItemUnit } from '@/types';
import ConfirmDialog from '@/components/confirm-dialog';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving…' : label}</button>;
}

const GST_PRESETS = [0, 5, 12, 18, 28];

interface Props {
  action: (prev: ItemState | null, data: FormData) => Promise<ItemState>;
  defaultValues?: Partial<Item>;
  cancelHref: string;
  categories: ItemCategory[];
  units: ItemUnit[];
}

// ─── Category selector with inline delete ──────────────────────────────────

function CategorySelect({
  categories: initial,
  value,
  onChange,
}: {
  categories: ItemCategory[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [categories, setCategories] = useState<ItemCategory[]>(initial);
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'finished' | 'raw_material'>('finished');
  const [addError, setAddError] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = categories.find((c) => c.id === value);
  const confirmDeleteCategory = categories.find((c) => c.id === confirmDeleteId);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setAddError('');
    const res = await fetch('/api/item-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, item_type: newType }),
    });
    const data = await res.json() as { id: string; name: string; item_type: 'finished' | 'raw_material'; error?: string };
    if (!res.ok) { setAddError(data.error ?? 'Failed'); return; }
    setCategories((prev) => [...prev, { id: data.id, name: data.name, item_type: data.item_type }]);
    onChange(data.id);
    setNewName('');
    setAddingNew(false);
    setOpen(false);
  }

  async function deleteCategory(id: string) {
    setDeleteMsg('');
    const res = await fetch(`/api/item-categories/${id}`, { method: 'DELETE' });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) { setDeleteMsg(data.error ?? 'Cannot delete'); return; }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (value === id) onChange('');
  }

  return (
    <>
    <ConfirmDialog
      open={confirmDeleteId !== null}
      title="Delete Category"
      message={`Delete "${confirmDeleteCategory?.name ?? ''}"? This cannot be undone.`}
      onConfirm={() => { const id = confirmDeleteId!; setConfirmDeleteId(null); deleteCategory(id); }}
      onCancel={() => setConfirmDeleteId(null)}
    />
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setAddingNew(false); setDeleteMsg(''); }}
        className="input w-full flex items-center justify-between text-left"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.name : 'Select category'}
        </span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>
      {selected && (
        <p className="mt-1 text-xs text-gray-400">
          Item type: <span className="font-medium">{selected.item_type === 'finished' ? 'Finished Good' : 'Raw Material'}</span>
        </p>
      )}
      {deleteMsg && (
        <p className="mt-1 text-xs text-red-500">{deleteMsg}</p>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto py-1">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                  c.id === value ? 'bg-purple-50' : ''
                }`}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => { onChange(c.id); setOpen(false); setDeleteMsg(''); }}
                >
                  <span className={`text-sm ${c.id === value ? 'font-semibold text-purple-700' : 'text-gray-800'}`}>
                    {c.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500 text-sm leading-none"
                  title="Delete category"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {addingNew ? (
            <div className="border-t border-gray-100 p-3 space-y-2">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                placeholder="Category name"
                className="input w-full text-sm py-1.5"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'finished' | 'raw_material')}
                className="input w-full text-sm py-1.5"
              >
                <option value="finished">Finished Good</option>
                <option value="raw_material">Raw Material</option>
              </select>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={addCategory} className="btn-primary text-xs py-1.5 flex-1">Add</button>
                <button type="button" onClick={() => { setAddingNew(false); setNewName(''); }} className="btn-secondary text-xs py-1.5">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-medium text-purple-600 hover:bg-purple-50"
            >
              + New Category
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ─── Unit selector with inline delete ──────────────────────────────────────

function UnitSelect({
  units: initial,
  value,
  onChange,
}: {
  units: ItemUnit[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [units, setUnits] = useState<ItemUnit[]>(initial);
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function addUnit() {
    const name = newName.trim();
    if (!name) return;
    setAddError('');
    const res = await fetch('/api/item-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json() as { id: string; name: string; error?: string };
    if (!res.ok) { setAddError(data.error ?? 'Failed'); return; }
    setUnits((prev) => [...prev, { id: data.id, name: data.name }]);
    onChange(data.name);
    setNewName('');
    setAddingNew(false);
    setOpen(false);
  }

  async function deleteUnit(id: string) {
    setDeleteMsg('');
    const res = await fetch(`/api/item-units/${id}`, { method: 'DELETE' });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) { setDeleteMsg(data.error ?? 'Cannot delete'); return; }
    const deleted = units.find((u) => u.id === id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    if (deleted && value === deleted.name) onChange('');
  }

  const confirmDeleteUnit = units.find((u) => u.id === confirmDeleteId);

  return (
    <>
    <ConfirmDialog
      open={confirmDeleteId !== null}
      title="Delete Unit"
      message={`Delete unit "${confirmDeleteUnit?.name ?? ''}"? This cannot be undone.`}
      onConfirm={() => { const id = confirmDeleteId!; setConfirmDeleteId(null); deleteUnit(id); }}
      onCancel={() => setConfirmDeleteId(null)}
    />
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setAddingNew(false); setDeleteMsg(''); }}
        className="input w-full flex items-center justify-between text-left"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || 'Select unit'}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>
      {deleteMsg && <p className="mt-1 text-xs text-red-500">{deleteMsg}</p>}

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto py-1">
            {units.map((u) => (
              <div
                key={u.id}
                className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                  u.name === value ? 'bg-purple-50' : ''
                }`}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => { onChange(u.name); setOpen(false); setDeleteMsg(''); }}
                >
                  <span className={`text-sm ${u.name === value ? 'font-semibold text-purple-700' : 'text-gray-800'}`}>
                    {u.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(u.id); }}
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500 text-sm leading-none"
                  title="Delete unit"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {addingNew ? (
            <div className="border-t border-gray-100 p-3 space-y-2">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUnit())}
                placeholder="Unit name (e.g. pcs, metre)"
                className="input w-full text-sm py-1.5"
              />
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={addUnit} className="btn-primary text-xs py-1.5 flex-1">Add</button>
                <button type="button" onClick={() => { setAddingNew(false); setNewName(''); }} className="btn-secondary text-xs py-1.5">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-medium text-purple-600 hover:bg-purple-50"
            >
              + New Unit
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ─── Main form ──────────────────────────────────────────────────────────────

export default function ItemForm({ action, defaultValues, cancelHref, categories, units }: Props) {
  const [state, formAction] = useFormState(action, null);

  const [categoryId, setCategoryId] = useState(defaultValues?.category_id ?? '');
  const [unitName, setUnitName] = useState(defaultValues?.unit ?? '');
  const [gstRate, setGstRate] = useState<number>(defaultValues?.gst_rate ?? 5);
  const [gstCustom, setGstCustom] = useState(!GST_PRESETS.includes(defaultValues?.gst_rate ?? 5));

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {/* Controlled hidden inputs */}
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="unit" value={unitName} />
      <input type="hidden" name="gst_rate" value={gstRate} />

      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <div>
        <label className="label mb-1">Item Name *</label>
        <input name="name" className="input" required defaultValue={defaultValues?.name} />
      </div>

      <div>
        <label className="label mb-2">Category *</label>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>

      <div>
        <label className="label mb-2">Unit *</label>
        <UnitSelect units={units} value={unitName} onChange={setUnitName} />
      </div>

      <div>
        <label className="label mb-1">GST Rate *</label>
        <div className="flex items-center gap-2 flex-wrap">
          {GST_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setGstRate(r); setGstCustom(false); }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                !gstCustom && gstRate === r
                  ? 'border-purple-600 bg-purple-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
              }`}
            >
              {r}%
            </button>
          ))}
          <button
            type="button"
            onClick={() => setGstCustom(true)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              gstCustom
                ? 'border-purple-600 bg-purple-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
            }`}
          >
            Custom
          </button>
          {gstCustom && (
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={gstRate}
              onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
              className="input w-24 text-sm"
              placeholder="e.g. 3"
              autoFocus
            />
          )}
        </div>
      </div>

      <div>
        <label className="label mb-1">
          HSN Code
          <span className="ml-1 font-normal text-gray-400">(min 4 digits)</span>
        </label>
        <input
          name="hsn_code"
          className="input font-mono"
          maxLength={10}
          placeholder="e.g. 5208"
          defaultValue={defaultValues?.hsn_code ?? ''}
        />
      </div>

      <div>
        <label className="label mb-1">
          Sale Price (₹)
          <span className="ml-1 font-normal text-gray-400">(GST-inclusive — auto-fills in invoice)</span>
        </label>
        <input
          name="sale_price"
          type="number"
          min="0"
          step="0.01"
          className="input"
          defaultValue={defaultValues?.sale_price ?? ''}
          placeholder="e.g. 599.00"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          defaultChecked={defaultValues?.is_active ?? true}
          className="h-4 w-4 rounded border-gray-300 text-purple-600"
        />
        <label htmlFor="is_active" className="text-sm text-gray-700">Active (appears in billing)</label>
      </div>

      <div className="flex gap-3 pt-2">
        <Submit label={defaultValues ? 'Update Item' : 'Create Item'} />
        <a href={cancelHref} className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
