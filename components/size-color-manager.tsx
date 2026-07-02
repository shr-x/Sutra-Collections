'use client';

import { useState } from 'react';
import ConfirmDialog from './confirm-dialog';

interface Size {
  id: string;
  size_name: string;
  is_default: boolean;
  sort_order: number;
}

interface Color {
  id: string;
  color_name: string;
  is_default: boolean;
  sort_order: number;
}

interface Warehouse {
  id: string;
  name: string;
}

interface StockCell {
  size_id: string;
  color_id: string;
  warehouse_id: string;
  quantity: number;
}

interface SizeColorManagerProps {
  itemId: string;
  initialSizes: Size[];
  initialColors: Color[];
  warehouses: Warehouse[];
  initialStock: StockCell[];
}

export default function SizeColorManager({
  itemId,
  initialSizes,
  initialColors,
  warehouses,
  initialStock,
}: SizeColorManagerProps) {
  const [sizes, setSizes] = useState<Size[]>(initialSizes);
  const [colors, setColors] = useState<Color[]>(initialColors);
  const [stock, setStock] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    initialStock.forEach((s) => {
      map[`${s.size_id}:${s.color_id}:${s.warehouse_id}`] = s.quantity;
    });
    return map;
  });

  const [newSizeName, setNewSizeName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [addingSize, setAddingSize] = useState(false);
  const [addingColor, setAddingColor] = useState(false);
  const [sizeError, setSizeError] = useState('');
  const [colorError, setColorError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'size' | 'color'; id: string; name: string } | null>(null);

  async function addSize() {
    const name = newSizeName.trim();
    if (!name) return;
    setAddingSize(true);
    setSizeError('');
    try {
      const res = await fetch(`/api/items/${itemId}/sizes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size_name: name }),
      });
      const data = await res.json();
      if (!res.ok) { setSizeError(data.error ?? 'Failed'); return; }
      setSizes((prev) => [...prev, data]);
      setNewSizeName('');
    } finally {
      setAddingSize(false);
    }
  }

  async function deleteSize(id: string) {
    const res = await fetch(`/api/items/${itemId}/sizes?size_id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { setSizeError(data.error ?? 'Cannot delete size'); return; }
    setSizes((prev) => prev.filter((s) => s.id !== id));
  }

  async function addColor() {
    const name = newColorName.trim();
    if (!name) return;
    setAddingColor(true);
    setColorError('');
    try {
      const res = await fetch(`/api/items/${itemId}/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_name: name }),
      });
      const data = await res.json();
      if (!res.ok) { setColorError(data.error ?? 'Failed'); return; }
      setColors((prev) => [...prev, data]);
      setNewColorName('');
    } finally {
      setAddingColor(false);
    }
  }

  async function deleteColor(id: string) {
    const res = await fetch(`/api/items/${itemId}/colors?color_id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { setColorError(data.error ?? 'Cannot delete colour'); return; }
    setColors((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <>
    <ConfirmDialog
      open={confirmDelete !== null}
      title={confirmDelete?.type === 'size' ? 'Delete Size' : 'Delete Colour'}
      message={`Delete "${confirmDelete?.name ?? ''}"? This cannot be undone.`}
      onConfirm={() => {
        if (confirmDelete?.type === 'size') deleteSize(confirmDelete.id);
        else if (confirmDelete?.type === 'color') deleteColor(confirmDelete.id);
        setConfirmDelete(null);
      }}
      onCancel={() => setConfirmDelete(null)}
    />
    <div className="space-y-8">
      {/* Sizes */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Sizes</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {sizes.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"
            >
              <span className="text-sm font-medium text-gray-800">{s.size_name}</span>
              {s.is_default && (
                <span className="text-xs text-gray-400">(default)</span>
              )}
              {!s.is_default && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ type: 'size', id: s.id, name: s.size_name })}
                  className="ml-1 text-gray-300 hover:text-red-500 text-sm leading-none"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add size (e.g. S, M, XL)"
            value={newSizeName}
            onChange={(e) => setNewSizeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSize())}
            className="input w-48 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addSize}
            disabled={addingSize || !newSizeName.trim()}
            className="btn-secondary py-1.5 text-sm disabled:opacity-50"
          >
            Add
          </button>
          {sizeError && <span className="text-xs text-red-500">{sizeError}</span>}
        </div>
      </div>

      {/* Colors */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Colours</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {colors.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"
            >
              <span className="text-sm font-medium text-gray-800">{c.color_name}</span>
              {c.is_default && (
                <span className="text-xs text-gray-400">(default)</span>
              )}
              {!c.is_default && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ type: 'color', id: c.id, name: c.color_name })}
                  className="ml-1 text-gray-300 hover:text-red-500 text-sm leading-none"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add colour (e.g. Red, Navy)"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addColor())}
            className="input w-48 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addColor}
            disabled={addingColor || !newColorName.trim()}
            className="btn-secondary py-1.5 text-sm disabled:opacity-50"
          >
            Add
          </button>
          {colorError && <span className="text-xs text-red-500">{colorError}</span>}
        </div>
      </div>

      {/* Stock grid — read-only */}
      {sizes.length > 0 && colors.length > 0 && warehouses.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Stock</h3>
          {warehouses.map((wh) => (
            <div key={wh.id} className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{wh.name}</p>
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 text-left text-xs font-medium text-gray-500 w-24">Size</th>
                      {colors.map((c) => (
                        <th key={c.id} className="py-1.5 px-3 text-center text-xs font-medium text-gray-500 min-w-[80px]">
                          {c.color_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="py-1.5 pr-4 text-xs font-medium text-gray-700">{s.size_name}</td>
                        {colors.map((c) => {
                          const key = `${s.id}:${c.id}:${wh.id}`;
                          const val = stock[key] ?? 0;
                          return (
                            <td key={c.id} className="py-1.5 px-3 text-center">
                              <span className="text-sm font-medium text-gray-800">{val}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="mt-1 text-xs text-gray-400">
            To update stock, use <strong className="font-medium text-gray-500">Billing → Purchases</strong> or <strong className="font-medium text-gray-500">Inventory → Stock Adjustments</strong>.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
