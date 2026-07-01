'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PickerSize {
  id: string;
  size_name: string;
  is_default: boolean;
}

interface PickerColor {
  id: string;
  color_name: string;
  is_default: boolean;
}

interface PickerItem {
  id: string;
  name: string;
  unit: string;
  gst_rate: number;
  hsn_code: string | null;
  item_type: string;
  category_id: string | null;
  category_name: string | null;
  sale_price: number | null;
  photo_url: string | null;
  stock_qty: number;
  low_stock_threshold: number | null;
  sizes: PickerSize[];
  colors: PickerColor[];
}

export interface PickerAddEvent {
  item_id: string;
  item_name: string;
  size_id: string | null;
  size_label: string;
  color_id: string | null;
  color_label: string;
  rate: number;
  hsn_code: string | null;
  gst_rate: number;
  quantity: number;
  stock_qty: number;
}

interface ItemPickerModalProps {
  open: boolean;
  warehouseId: string;
  onAdd: (event: PickerAddEvent) => void;
  onClose: () => void;
}

// ─── Pending queue ─────────────────────────────────────────────────────────

interface PendingSlot {
  item: PickerItem;
  sizeId: string;
  colorId: string;
  qty: number;
}

function pendingKey(itemId: string, sizeId: string, colorId: string) {
  return `${itemId}::${sizeId}::${colorId}`;
}

// ─── Color swatch hex map ──────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  black: '#000000', white: '#ffffff', pink: '#ec4899', purple: '#a855f7',
  orange: '#f97316', grey: '#9ca3af', gray: '#9ca3af', none: '#9ca3af',
  navy: '#1e3a5f', brown: '#92400e', maroon: '#7f1d1d', cream: '#fef3c7',
  beige: '#e5d3b3', gold: '#d97706', silver: '#9ca3af',
};

function colorSwatch(name: string): string | null {
  return COLOR_HEX[name.toLowerCase()] ?? null;
}

// ─── Photo placeholder ────────────────────────────────────────────────────

function ItemPhoto({ item, size = 'sm' }: { item: PickerItem; size?: 'sm' | 'lg' }) {
  const [error, setError] = useState(false);
  if (item.photo_url && !error) {
    return (
      <img src={item.photo_url} alt={item.name} className="h-full w-full object-cover"
        onError={() => setError(true)} />
    );
  }
  const initials = item.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-100">
      <span className={`font-bold text-gray-300 select-none ${size === 'lg' ? 'text-4xl' : 'text-2xl'}`}>
        {initials}
      </span>
    </div>
  );
}

// ─── Stock badge ──────────────────────────────────────────────────────────

function StockBadge({ qty, unit, threshold }: { qty: number; unit: string; threshold: number }) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold';
  if (qty <= 0) return <span className={`${base} bg-red-100 text-red-600`}>No stock</span>;
  if (qty <= threshold) return <span className={`${base} bg-amber-100 text-amber-700`}>⚠ {qty} {unit}</span>;
  return <span className={`${base} bg-green-100 text-green-700`}>✓ {qty} {unit}</span>;
}

function needsPicker(item: PickerItem): boolean {
  const hasMultipleSizes = item.sizes.length > 1 ||
    (item.sizes.length === 1 && item.sizes[0].size_name !== 'Regular');
  const hasMultipleColors = item.colors.length > 1 ||
    (item.colors.length === 1 && item.colors[0].color_name !== 'None');
  return hasMultipleSizes || hasMultipleColors;
}

// ─── Main modal ────────────────────────────────────────────────────────────

export default function ItemPickerModal({ open, warehouseId, onAdd, onClose }: ItemPickerModalProps) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);
  const [schemes, setSchemes] = useState<Array<{
    id: string; name: string; scheme_type: string; discount_value: number | null;
    min_order_value: number | null; valid_from: string | null; valid_until: string | null;
    buy_item_name: string | null; get_item_name: string | null;
    buy_quantity: number | null; get_quantity: number | null;
  }>>([]);
  const [schemesLoading, setSchemesLoading] = useState(false);
  const [pickerItem, setPickerItem] = useState<PickerItem | null>(null);
  const [selectedSizeId, setSelectedSizeId] = useState('');
  const [selectedColorId, setSelectedColorId] = useState('');
  const [pickerQty, setPickerQty] = useState(1);

  const [variantStock, setVariantStock] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // Multi-add pending queue
  const [pending, setPending] = useState<Record<string, PendingSlot>>({});

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    setActiveCategoryId(null);
    setShowOffers(false);
    setPickerItem(null);
    setPending({});
    setPickerQty(1);

    const qs = warehouseId ? `?warehouse=${warehouseId}` : '';
    fetch(`/api/items/picker${qs}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, warehouseId]);

  useEffect(() => {
    if (!showOffers) return;
    setSchemesLoading(true);
    fetch('/api/schemes/active')
      .then((r) => r.json())
      .then((data) => setSchemes(Array.isArray(data) ? data : []))
      .catch(() => setSchemes([]))
      .finally(() => setSchemesLoading(false));
  }, [showOffers]);

  useEffect(() => {
    if (open && !pickerItem) {
      const t = setTimeout(() => searchRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open, pickerItem]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pickerItem) setPickerItem(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, pickerItem, onClose]);

  // Reset qty counter when switching variant picker items
  useEffect(() => { setPickerQty(1); }, [pickerItem]);

  useEffect(() => {
    if (!pickerItem) { setVariantStock({}); return; }
    setStockLoading(true);
    const qs = warehouseId ? `?warehouse=${warehouseId}` : '';
    fetch(`/api/items/${pickerItem.id}/stock-by-variant${qs}`)
      .then((r) => r.json())
      .then((data) => setVariantStock(typeof data === 'object' ? data : {}))
      .catch(() => setVariantStock({}))
      .finally(() => setStockLoading(false));
  }, [pickerItem, warehouseId]);

  const categories = Array.from(
    new Map(
      items.filter((i) => i.category_id)
        .map((i) => [i.category_id!, { id: i.category_id!, name: i.category_name ?? i.item_type }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredItems = items.filter((item) => {
    if (activeCategoryId && item.category_id !== activeCategoryId) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPending = Object.values(pending).reduce((s, p) => s + p.qty, 0);

  const buildEvent = useCallback(
    (item: PickerItem, sizeId: string, colorId: string, qty: number): PickerAddEvent => {
      const size = item.sizes.find((s) => s.id === sizeId);
      const color = item.colors.find((c) => c.id === colorId);
      return {
        item_id: item.id,
        item_name: item.name,
        size_id: sizeId || null,
        size_label: size?.size_name ?? '',
        color_id: colorId || null,
        color_label: color?.color_name ?? '',
        rate: item.sale_price ?? 0,
        hsn_code: item.hsn_code,
        gst_rate: item.gst_rate,
        quantity: qty,
        stock_qty: item.stock_qty,
      };
    },
    []
  );

  // ── Pending queue helpers ─────────────────────────────────────────────────

  const addSimple = useCallback((item: PickerItem) => {
    if (item.stock_qty <= 0) return;
    const sizeId = item.sizes.find((s) => s.is_default)?.id ?? item.sizes[0]?.id ?? '';
    const colorId = item.colors.find((c) => c.is_default)?.id ?? item.colors[0]?.id ?? '';
    const key = pendingKey(item.id, sizeId, colorId);
    setPending((prev) => {
      const newQty = Math.min(item.stock_qty, (prev[key]?.qty ?? 0) + 1);
      return { ...prev, [key]: { item, sizeId, colorId, qty: newQty } };
    });
  }, []);

  const adjustQty = useCallback((key: string, delta: number) => {
    setPending((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      const newQty = Math.min(cur.item.stock_qty, Math.max(0, cur.qty + delta));
      if (newQty === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...cur, qty: newQty } };
    });
  }, []);

  const handleChooseVariant = useCallback((item: PickerItem) => {
    setPickerItem(item);
    setSelectedSizeId(item.sizes.find((s) => s.is_default)?.id ?? item.sizes[0]?.id ?? '');
    setSelectedColorId(item.colors.find((c) => c.is_default)?.id ?? item.colors[0]?.id ?? '');
  }, []);

  const handleAddToQueue = useCallback(() => {
    if (!pickerItem) return;
    const key = pendingKey(pickerItem.id, selectedSizeId, selectedColorId);
    const maxQty = variantStock[`${selectedSizeId}:${selectedColorId}`] ?? 0;
    setPending((prev) => {
      const existingQty = prev[key]?.qty ?? 0;
      const newQty = Math.min(maxQty, existingQty + pickerQty);
      return {
        ...prev,
        [key]: { item: pickerItem, sizeId: selectedSizeId, colorId: selectedColorId, qty: newQty },
      };
    });
    setPickerItem(null);
  }, [pickerItem, selectedSizeId, selectedColorId, pickerQty, variantStock]);

  const handleConfirm = useCallback(() => {
    Object.values(pending).forEach(({ item, sizeId, colorId, qty }) => {
      if (qty > 0) onAdd(buildEvent(item, sizeId, colorId, qty));
    });
    onClose();
  }, [pending, buildEvent, onAdd, onClose]);

  // ── Variant picker availability ───────────────────────────────────────────
  const comboQty = (sizeId: string, colorId: string): number =>
    variantStock[`${sizeId}:${colorId}`] ?? 0;
  const sizeHasStock = (sizeId: string): boolean =>
    !pickerItem || pickerItem.colors.some((c) => comboQty(sizeId, c.id) > 0);
  const colorHasStock = (colorId: string): boolean =>
    comboQty(selectedSizeId, colorId) > 0;
  const currentVariantQty = pickerItem
    ? (variantStock[`${selectedSizeId}:${selectedColorId}`] ?? 0)
    : 0;
  const isOos = !stockLoading && pickerItem !== null && currentVariantQty <= 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        {pickerItem ? (
          <button type="button" onClick={() => setPickerItem(null)}
            className="flex items-center gap-1.5 text-sm font-semibold text-purple-700 hover:text-purple-900">
            ← Back to items
          </button>
        ) : (
          <h2 className="font-semibold text-gray-900">Select Item</h2>
        )}
        <div className="flex items-center gap-3">
          {!pickerItem && (
            <div className="relative w-72">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input ref={searchRef} type="text" placeholder="Search items…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-full py-2 pl-9 text-sm" />
            </div>
          )}
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 text-lg leading-none">
            ×
          </button>
        </div>
      </div>

      {pickerItem ? (
        /* ── Variant picker screen ──────────────────────────────────────────── */
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-8">
          <div className="w-full max-w-md">
            {/* Already-queued badge */}
            {(() => {
              const alreadyQty = Object.values(pending)
                .filter((p) => p.item.id === pickerItem.id)
                .reduce((s, p) => s + p.qty, 0);
              return alreadyQty > 0 ? (
                <p className="mb-3 text-center text-xs font-medium text-purple-600">
                  {alreadyQty} already in queue
                </p>
              ) : null;
            })()}

            <div className="mx-auto mb-5 h-32 w-32 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <ItemPhoto item={pickerItem} size="lg" />
            </div>
            <div className="mb-6 text-center">
              <h3 className="text-xl font-bold text-gray-900">{pickerItem.name}</h3>
              {pickerItem.sale_price != null && (
                <p className="mt-1 text-lg font-semibold text-purple-700">
                  ₹{pickerItem.sale_price.toLocaleString('en-IN')}
                  <span className="ml-1 text-sm font-normal text-gray-400">/ {pickerItem.unit}</span>
                </p>
              )}
            </div>

            {/* Size pills */}
            {pickerItem.sizes.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Size</p>
                <div className="flex flex-wrap gap-2">
                  {pickerItem.sizes.map((s) => {
                    const avail = stockLoading || sizeHasStock(s.id);
                    return (
                      <button key={s.id} type="button" disabled={!avail}
                        onClick={() => { if (avail) setSelectedSizeId(s.id); }}
                        className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                          selectedSizeId === s.id
                            ? 'border-purple-600 bg-purple-600 text-white'
                            : !avail
                            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 line-through'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                        }`}>
                        {s.size_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Colour pills */}
            {pickerItem.colors.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Colour</p>
                <div className="flex flex-wrap gap-2">
                  {pickerItem.colors.map((c) => {
                    const hex = colorSwatch(c.color_name);
                    const isSelected = selectedColorId === c.id;
                    const avail = stockLoading || colorHasStock(c.id);
                    return (
                      <button key={c.id} type="button" disabled={!avail}
                        onClick={() => { if (avail) setSelectedColorId(c.id); }}
                        className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-purple-600 bg-purple-600 text-white'
                            : !avail
                            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 line-through'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                        }`}>
                        {hex && (
                          <span className={`inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border border-black/10 ${!avail ? 'opacity-30' : ''}`}
                            style={{ backgroundColor: hex }} />
                        )}
                        {c.color_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Combo stock */}
            <div className="mb-4 text-center">
              {stockLoading ? (
                <span className="text-xs text-gray-400">Checking stock…</span>
              ) : currentVariantQty > 0 ? (
                <span className="text-sm font-medium text-green-600">
                  ✓ In stock: {currentVariantQty} {pickerItem.unit}
                </span>
              ) : (
                <span className="text-sm font-medium text-red-500">Out of stock</span>
              )}
            </div>

            {/* Qty selector */}
            {!isOos && (
              <div className="mb-5 flex items-center justify-center gap-4">
                <span className="text-sm font-semibold text-gray-500">Quantity</span>
                <div className="flex items-center overflow-hidden rounded-lg border border-gray-200">
                  <button type="button" onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 items-center justify-center text-gray-600 hover:bg-gray-50 text-xl font-medium">
                    −
                  </button>
                  <span className="w-12 text-center text-base font-bold text-gray-900">{pickerQty}</span>
                  <button type="button"
                    onClick={() => setPickerQty((q) => Math.min(currentVariantQty, q + 1))}
                    disabled={pickerQty >= currentVariantQty}
                    className={`flex h-10 w-10 items-center justify-center text-xl font-medium ${
                      pickerQty >= currentVariantQty
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    +
                  </button>
                </div>
              </div>
            )}

            {isOos ? (
              <div className="space-y-2">
                <button type="button" disabled
                  className="w-full cursor-not-allowed rounded-xl bg-gray-100 py-3 text-base font-medium text-gray-400">
                  Out of stock
                </button>
                <p className="text-center text-xs text-gray-400">
                  <a href="/billing/purchases/new" target="_blank" rel="noreferrer"
                    className="font-medium text-purple-600 hover:underline">
                    Purchase Stock →
                  </a>
                </p>
              </div>
            ) : (
              <button type="button" onClick={handleAddToQueue} className="btn-primary w-full py-3 text-base">
                + Add to Queue
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Item grid screen ────────────────────────────────────────────────── */
        <>
          {/* Category pills + Offers */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-2.5 overflow-x-auto">
            <button type="button"
              onClick={() => { setActiveCategoryId(null); setShowOffers(false); }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeCategoryId === null && !showOffers
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              All
            </button>
            {categories.map((cat) => (
              <button key={cat.id} type="button"
                onClick={() => { setActiveCategoryId(cat.id); setShowOffers(false); }}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeCategoryId === cat.id && !showOffers
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {cat.name}
              </button>
            ))}
            <button type="button"
              onClick={() => { setShowOffers(true); setActiveCategoryId(null); }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                showOffers
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
              }`}>
              🎁 Offers
            </button>
            <span className="ml-auto shrink-0 text-xs text-gray-400">
              {showOffers
                ? `${schemes.length} offer${schemes.length !== 1 ? 's' : ''}`
                : `${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {showOffers ? (
              schemesLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading offers…</div>
              ) : schemes.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400">No active offers</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {schemes.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase())).map((scheme) => {
                    const expiringSoon = scheme.valid_until
                      ? (new Date(scheme.valid_until).getTime() - Date.now()) / 86400000 <= 7
                      : false;
                    const dealTitle = scheme.scheme_type === 'buy_x_get_y'
                      ? `Buy ${scheme.buy_quantity ?? 1} Get ${scheme.get_quantity ?? 1} Free`
                      : scheme.scheme_type.replace(/_/g, ' ');
                    return (
                      <div key={scheme.id} className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-amber-50 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-purple-900">{scheme.name}</p>
                            <p className="mt-0.5 text-xs font-semibold capitalize text-purple-600">{dealTitle}</p>
                          </div>
                          {scheme.discount_value != null && (
                            <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                              {scheme.discount_value}% OFF
                            </span>
                          )}
                        </div>
                        {scheme.buy_item_name && (
                          <p className="mt-2 text-xs text-gray-600">
                            Buy {scheme.buy_quantity ?? 1}× {scheme.buy_item_name}
                            {scheme.get_item_name ? ` → Get ${scheme.get_quantity ?? 1}× ${scheme.get_item_name} free` : ''}
                          </p>
                        )}
                        {scheme.min_order_value && (
                          <p className="text-xs text-gray-400 mt-1">Min order: ₹{scheme.min_order_value}</p>
                        )}
                        {scheme.valid_until && (
                          <p className={`mt-1.5 text-xs font-semibold ${expiringSoon ? 'text-red-600' : 'text-gray-500'}`}>
                            {expiringSoon ? '⏰ Expires ' : 'Valid until '}
                            {new Date(scheme.valid_until).toLocaleDateString('en-IN')}
                          </p>
                        )}
                        <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          ✓ Auto-applied at billing
                        </span>
                      </div>
                    );
                  })}
                </div>
              )
            ) : loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">Loading…</div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">No items found</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredItems.map((item) => {
                  const simple = !needsPicker(item);
                  const defSizeId = item.sizes.find((s) => s.is_default)?.id ?? item.sizes[0]?.id ?? '';
                  const defColorId = item.colors.find((c) => c.is_default)?.id ?? item.colors[0]?.id ?? '';
                  const slotKey = simple ? pendingKey(item.id, defSizeId, defColorId) : '';
                  const slot = simple ? pending[slotKey] : undefined;
                  const variantQueuedQty = !simple
                    ? Object.values(pending).filter((p) => p.item.id === item.id).reduce((s, p) => s + p.qty, 0)
                    : 0;
                  const reservedQty = simple ? (slot?.qty ?? 0) : variantQueuedQty;
                  const remaining = item.stock_qty - reservedQty;
                  const hasNoStock = item.stock_qty <= 0;
                  const isSelected = !!slot || variantQueuedQty > 0;

                  return (
                    <div key={item.id}
                      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-purple-500 ring-2 ring-purple-300'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}>
                      <div className="h-32 overflow-hidden">
                        <ItemPhoto item={item} />
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-2.5">
                        <p className="line-clamp-2 text-xs font-semibold leading-tight text-gray-900">{item.name}</p>
                        {item.sale_price != null ? (
                          <p className="text-sm font-bold text-purple-700">₹{item.sale_price}</p>
                        ) : (
                          <p className="text-xs text-gray-400">No price</p>
                        )}
                        <div className="mt-auto">
                          <StockBadge qty={remaining} unit={item.unit} threshold={item.low_stock_threshold ?? 5} />
                        </div>
                      </div>

                      {/* Bottom action */}
                      {simple ? (
                        slot ? (
                          <div className="m-2 mt-0 flex items-center overflow-hidden rounded-lg border border-purple-300 bg-purple-50">
                            <button type="button" onClick={() => adjustQty(slotKey, -1)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center text-purple-700 hover:bg-purple-100 text-lg font-bold">
                              −
                            </button>
                            <span className="flex-1 text-center text-sm font-bold text-purple-800">{slot.qty}</span>
                            <button type="button"
                              onClick={() => adjustQty(slotKey, +1)}
                              disabled={slot.qty >= item.stock_qty}
                              className={`flex h-8 w-8 shrink-0 items-center justify-center text-lg font-bold ${
                                slot.qty >= item.stock_qty
                                  ? 'text-purple-300 cursor-not-allowed'
                                  : 'text-purple-700 hover:bg-purple-100'
                              }`}>
                              +
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => addSimple(item)}
                            disabled={hasNoStock}
                            className={`m-2 mt-0 rounded-lg py-2 text-xs font-semibold transition-colors ${
                              hasNoStock
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}>
                            + Add
                          </button>
                        )
                      ) : (
                        <button type="button" onClick={() => handleChooseVariant(item)}
                          className="m-2 mt-0 rounded-lg border border-purple-300 py-2 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
                          {variantQueuedQty > 0 ? `✓ ${variantQueuedQty} queued →` : 'Choose →'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky confirm bar */}
          {totalPending > 0 && (
            <div className="shrink-0 border-t border-purple-200 bg-purple-50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-purple-800">
                {totalPending} item{totalPending !== 1 ? 's' : ''} selected
              </span>
              <button type="button" onClick={handleConfirm}
                className="rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors">
                Confirm Selections
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
