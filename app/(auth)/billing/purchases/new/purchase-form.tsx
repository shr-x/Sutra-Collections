'use client';

import { useState, useTransition, useEffect } from 'react';
import { useFormState } from 'react-dom';
import { calcLine, calcInvoiceTotals, formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';
import type { ActionResult } from '@/types';
import { AI_PREFILL_KEY, type AiImportResult, type AiImportItem } from '@/components/purchase-ai-import';

interface ItemSize { id: string; size_name: string; is_default: boolean }
interface ItemColor { id: string; color_name: string; is_default: boolean }
interface ItemOpt {
  id: string; name: string; unit: string; gst_rate: number; hsn_code: string | null;
  sale_price: number | null;
  sizes: ItemSize[]; colors: ItemColor[];
}
interface SupplierOpt { id: string; name: string }
interface WarehouseOpt { id: string; name: string }

interface Props {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  items: ItemOpt[];
  suppliers: SupplierOpt[];
  warehouses: WarehouseOpt[];
  defaultWarehouseId: string | null;
}

let _k = 0;
function nk() { return `pur-${++_k}`; }

interface Line {
  key: string;
  item_id: string; item_name: string;
  size_id: string | null; size_name: string;
  color_id: string | null; color_name: string;
  quantity: number; rate: number; gst_rate: number; hsn_code: string | null;
}

export default function PurchaseForm({ action, items, suppliers: initialSuppliers, warehouses, defaultWarehouseId }: Props) {
  const [state, formAction] = useFormState<ActionResult, FormData>(action, { success: false });
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  // ── Supplier with inline-add ───────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState('');
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupGstin, setNewSupGstin] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState('');

  const handleSupplierChange = (val: string) => {
    if (val === '__new__') { setShowNewSupplier(true); setSupplierId(''); }
    else { setShowNewSupplier(false); setSupplierId(val); }
  };

  const saveNewSupplier = async () => {
    if (!newSupName.trim()) { setSupplierError('Name required'); return; }
    setSavingSupplier(true);
    setSupplierError('');
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupName.trim(), phone: newSupPhone || null, gstin: newSupGstin || null }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) { setSupplierError(data.error ?? 'Failed to save'); return; }
      const newSup: SupplierOpt = { id: data.id, name: newSupName.trim() };
      setSuppliers((prev) => [...prev, newSup].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(data.id);
      setShowNewSupplier(false);
      setNewSupName(''); setNewSupPhone(''); setNewSupGstin('');
    } catch { setSupplierError('Network error'); }
    finally { setSavingSupplier(false); }
  };

  // ── Other header state ─────────────────────────────────────────────────────
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? '');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [supplierInvNum, setSupplierInvNum] = useState('');
  const [includeInGst, setIncludeInGst] = useState(true);
  const [notes, setNotes] = useState('');
  // Mutable local copy of items — updated in-place when user adds a new size/color
  // so the selects refresh without a page reload that would erase form state.
  const [localItems, setLocalItems] = useState<ItemOpt[]>(items);
  const [lines, setLines] = useState<Line[]>([]);
  const [importBanner, setImportBanner] = useState('');

  // ── Unmatched AI items → "add new product" suggestions (#3) ─────────────────
  const [unmatchedItems, setUnmatchedItems] = useState<AiImportItem[]>([]);
  // AI extracted a size/color that doesn't exist yet for the matched product
  const [variantMismatches, setVariantMismatches] = useState<Array<{
    itemName: string; extractedSize: string | null; extractedColor: string | null;
  }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  // The unmatched item currently being added as a product (null = modal closed)
  const [productDraft, setProductDraft] = useState<AiImportItem | null>(null);
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pGst, setPGst] = useState('0');
  const [pHsn, setPHsn] = useState('');
  const [pUnit, setPUnit] = useState('pcs');
  const [pSalePrice, setPSalePrice] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [productError, setProductError] = useState('');

  useEffect(() => {
    fetch('/api/item-categories')
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
  }, []);

  const openProductModal = (it: AiImportItem) => {
    setProductDraft(it);
    setPName(it.name);
    setPGst(String([0, 5, 12, 18, 28].includes(it.gst_rate) ? it.gst_rate : 0));
    setPHsn(it.hsn_code ?? '');
    setPUnit('pcs');
    setPSalePrice(it.rate ? String(it.rate) : '');
    setPCategory('');
    setProductError('');
  };

  const skipUnmatched = (it: AiImportItem) =>
    setUnmatchedItems((prev) => prev.filter((u) => u !== it));

  const saveNewProduct = async () => {
    if (!productDraft) return;
    if (!pName.trim()) { setProductError('Name required'); return; }
    setSavingProduct(true);
    setProductError('');
    try {
      const res = await fetch('/api/items/quick-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pName.trim(),
          gst_rate: Number(pGst),
          hsn_code: pHsn || null,
          unit: pUnit,
          sale_price: pSalePrice || null,
          category_id: pCategory || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.id) { setProductError(data.error ?? 'Failed to save product'); return; }
      // Add the new product as a purchase line using the AI qty + rate
      setLines((prev) => [
        ...prev,
        {
          key: nk(),
          item_id: data.id,
          item_name: data.name ?? pName.trim(),
          size_id: null, size_name: '',
          color_id: null, color_name: '',
          quantity: productDraft.quantity || 1,
          rate: productDraft.rate || Number(pSalePrice) || 0,
          gst_rate: Number(pGst),
          hsn_code: pHsn || null,
        },
      ]);
      setUnmatchedItems((prev) => prev.filter((u) => u !== productDraft));
      setProductDraft(null);
    } catch {
      setProductError('Network error');
    } finally {
      setSavingProduct(false);
    }
  };

  // ── AI Import prefill (#4) ──────────────────────────────────────────────────
  // The /billing/purchases AI Import modal stashes extracted data in
  // sessionStorage and navigates here; consume it once on mount.
  useEffect(() => {
    const raw = sessionStorage.getItem(AI_PREFILL_KEY);
    if (!raw) return;
    sessionStorage.removeItem(AI_PREFILL_KEY);
    try {
      const r = JSON.parse(raw) as AiImportResult;
      if (r.supplier?.id) {
        setSupplierId(r.supplier.id);
      } else if (r.supplier?.name) {
        setShowNewSupplier(true);
        setNewSupName(r.supplier.name);
      }
      if (r.invoice_number) setSupplierInvNum(r.invoice_number);
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) setPurchaseDate(r.date);
      if (r.notes) setNotes(r.notes);

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const mismatches: Array<{ itemName: string; extractedSize: string | null; extractedColor: string | null }> = [];

      const newLines: Line[] = (r.items ?? [])
        .filter((it) => it.item_id)
        .map((it) => {
          const item = localItems.find((i) => i.id === it.item_id);
          // Match extracted size/color to existing variants (case/punctuation-insensitive)
          const matchSize = it.size
            ? item?.sizes.find((s) => norm(s.size_name) === norm(it.size as string))
            : undefined;
          const matchColor = it.color
            ? item?.colors.find((c) => norm(c.color_name) === norm(it.color as string))
            : undefined;

          // If AI extracted a value but it doesn't match any variant, warn the user
          // instead of silently falling back to the default.
          const sizeMismatch = it.size && !matchSize;
          const colorMismatch = it.color && !matchColor;
          if (sizeMismatch || colorMismatch) {
            mismatches.push({
              itemName: item?.name ?? it.name,
              extractedSize: sizeMismatch ? it.size : null,
              extractedColor: colorMismatch ? it.color : null,
            });
          }

          // Only fall back to default when AI didn't extract a value at all
          const size = matchSize ?? (!it.size ? (item?.sizes.find((s) => s.is_default) ?? item?.sizes[0]) : undefined);
          const color = matchColor ?? (!it.color ? (item?.colors.find((c) => c.is_default) ?? item?.colors[0]) : undefined);

          return {
            key: nk(),
            item_id: it.item_id as string,
            item_name: item?.name ?? it.name,
            size_id: size?.id ?? null,
            size_name: size?.size_name ?? '',
            color_id: color?.id ?? null,
            color_name: color?.color_name ?? '',
            quantity: it.quantity || 1,
            rate: it.rate || 0,
            gst_rate: it.gst_rate || item?.gst_rate || 0,
            hsn_code: it.hsn_code ?? item?.hsn_code ?? null,
          };
        });
      if (newLines.length) setLines(newLines);
      if (mismatches.length) setVariantMismatches(mismatches);

      const unmatched = (r.items ?? []).filter((it) => !it.item_id);
      setUnmatchedItems(unmatched);
      setImportBanner(
        unmatched.length
          ? `AI import: ${newLines.length} item(s) added. ${unmatched.length} not found in your products — add them below.`
          : `AI import: ${newLines.length} item(s) added from your pasted invoice.`
      );
    } catch {
      /* ignore malformed prefill */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Item add row ───────────────────────────────────────────────────────────
  const [addItemId, setAddItemId] = useState('');
  const [addSizeId, setAddSizeId] = useState('');
  const [addColorId, setAddColorId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addRate, setAddRate] = useState('');

  // Inline size add
  const [showAddSize, setShowAddSize] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [sizeError, setSizeError] = useState('');

  // Inline color add
  const [showAddColor, setShowAddColor] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [colorError, setColorError] = useState('');

  const selItem = localItems.find((i) => i.id === addItemId);

  // Auto-fill size, color, and rate when item selected
  useEffect(() => {
    if (!selItem) { setAddSizeId(''); setAddColorId(''); setAddRate(''); return; }
    setAddSizeId(selItem.sizes.find((s) => s.is_default)?.id ?? selItem.sizes[0]?.id ?? '');
    setAddColorId(selItem.colors.find((c) => c.is_default)?.id ?? selItem.colors[0]?.id ?? '');
    if (selItem.sale_price != null) setAddRate(String(selItem.sale_price));
    setShowAddSize(false);
    setShowAddColor(false);
  }, [addItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Totals
  const lineResults = lines.map((l) => calcLine({ quantity: l.quantity, rate: l.rate, gstRate: l.gst_rate }));
  const totals = calcInvoiceTotals(lineResults);

  const addLine = () => {
    const item = localItems.find((i) => i.id === addItemId);
    if (!item || !addRate) return;
    const size = item.sizes.find((s) => s.id === addSizeId);
    const color = item.colors.find((c) => c.id === addColorId);
    setLines((prev) => [
      ...prev,
      {
        key: nk(),
        item_id: item.id, item_name: item.name,
        size_id: addSizeId || null, size_name: size?.size_name ?? '',
        color_id: addColorId || null, color_name: color?.color_name ?? '',
        quantity: parseFloat(addQty), rate: parseFloat(addRate),
        gst_rate: item.gst_rate, hsn_code: item.hsn_code,
      },
    ]);
    setAddItemId(''); setAddSizeId(''); setAddColorId(''); setAddQty('1'); setAddRate('');
  };

  const saveNewSize = async () => {
    if (!newSizeName.trim() || !addItemId) { setSizeError('Name required'); return; }
    try {
      const res = await fetch(`/api/items/${addItemId}/sizes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size_name: newSizeName.trim() }),
      });
      const data = await res.json() as { id: string; size_name: string; is_default: boolean; error?: string };
      if (!res.ok) { setSizeError(data.error ?? 'Failed'); return; }
      // Update localItems in-place — no reload needed, existing form state is preserved
      setLocalItems((prev) => prev.map((it) =>
        it.id === addItemId ? { ...it, sizes: [...it.sizes, { id: data.id, size_name: data.size_name, is_default: false }] } : it
      ));
      setAddSizeId(data.id);
      setNewSizeName(''); setShowAddSize(false); setSizeError('');
    } catch { setSizeError('Network error'); }
  };

  const saveNewColor = async () => {
    if (!newColorName.trim() || !addItemId) { setColorError('Name required'); return; }
    try {
      const res = await fetch(`/api/items/${addItemId}/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_name: newColorName.trim() }),
      });
      const data = await res.json() as { id: string; color_name: string; is_default: boolean; error?: string };
      if (!res.ok) { setColorError(data.error ?? 'Failed'); return; }
      // Update localItems in-place — no reload needed, existing form state is preserved
      setLocalItems((prev) => prev.map((it) =>
        it.id === addItemId ? { ...it, colors: [...it.colors, { id: data.id, color_name: data.color_name, is_default: false }] } : it
      ));
      setAddColorId(data.id);
      setNewColorName(''); setShowAddColor(false); setColorError('');
    } catch { setColorError('Network error'); }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      supplier_id: supplierId, warehouse_id: warehouseId,
      supplier_invoice_number: supplierInvNum || null,
      purchase_date: purchaseDate, include_in_gst: includeInGst,
      notes: notes || null,
      items: lines.map((l) => ({
        item_id: l.item_id,
        size_id: l.size_id, color_id: l.color_id,
        quantity: l.quantity, rate: l.rate,
        gst_rate: l.gst_rate, hsn_code: l.hsn_code,
      })),
    }));
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {state.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}
      {importBanner && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          <span>✨ {importBanner}</span>
          <button type="button" onClick={() => setImportBanner('')} className="text-purple-400 hover:text-purple-700 leading-none">×</button>
        </div>
      )}

      {variantMismatches.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">⚠️ Some AI-extracted sizes/colours weren&apos;t found in your product list:</p>
          {variantMismatches.map((m, i) => (
            <p key={i} className="text-xs">
              <span className="font-medium">{m.itemName}</span>
              {m.extractedSize && <> · Size: <span className="font-medium">{m.extractedSize}</span></>}
              {m.extractedColor && <> · Colour: <span className="font-medium">{m.extractedColor}</span></>}
              {' '}— please select the correct variant in the item line, or add the missing size/colour first.
            </p>
          ))}
          <button type="button" onClick={() => setVariantMismatches([])} className="mt-1 text-xs text-amber-600 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="card">
        <h2 className="mb-4 font-semibold text-gray-900">Purchase Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Supplier with inline add */}
          <div>
            <label className="label">Supplier *</label>
            <select className="input" value={showNewSupplier ? '__new__' : supplierId} onChange={(e) => handleSupplierChange(e.target.value)} required={!showNewSupplier}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new__">+ Add new supplier…</option>
            </select>
            {showNewSupplier && (
              <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-purple-700">New Supplier</p>
                <input className="input text-sm" placeholder="Name *" value={newSupName} onChange={(e) => setNewSupName(e.target.value)} />
                <input className="input text-sm" placeholder="Phone (optional)" value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} />
                <input className="input text-sm" placeholder="GSTIN (optional)" value={newSupGstin} onChange={(e) => setNewSupGstin(e.target.value)} maxLength={15} />
                {supplierError && <p className="text-xs text-red-600">{supplierError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={saveNewSupplier} disabled={savingSupplier} className="btn-primary text-xs py-1">{savingSupplier ? 'Saving…' : 'Save & Select'}</button>
                  <button type="button" onClick={() => { setShowNewSupplier(false); setSupplierId(''); }} className="btn-secondary text-xs py-1">Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Warehouse *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Purchase Date *</label>
            <DatePicker className="input" value={purchaseDate} onChange={(v) => setPurchaseDate(v)} required />
          </div>
          <div>
            <label className="label">Supplier Invoice #</label>
            <input type="text" className="input" value={supplierInvNum} onChange={(e) => setSupplierInvNum(e.target.value)} placeholder="Supplier's bill number" maxLength={100} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="itc" checked={includeInGst} onChange={(e) => setIncludeInGst(e.target.checked)} />
            <label htmlFor="itc" className="text-sm">Eligible for ITC (GST credit)</label>
          </div>
          <div>
            <label className="label">Notes</label>
            <input type="text" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-gray-900">Items</h2>

        {/* Add item row */}
        <div className="flex flex-wrap gap-2 mb-4 items-end">
          <div className="min-w-[180px] flex-[3]">
            <label className="label text-xs">Item</label>
            <select className="input text-sm" value={addItemId} onChange={(e) => setAddItemId(e.target.value)}>
              <option value="">Select item</option>
              {localItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            {selItem && (
              <p className="mt-1 text-xs text-gray-400">
                GST {selItem.gst_rate}%{selItem.hsn_code ? ` · HSN ${selItem.hsn_code}` : ''}
              </p>
            )}
          </div>

          {/* Size — always shown when item has sizes */}
          {selItem && (
            <div className="min-w-[100px] flex-1">
              <label className="label text-xs">Size</label>
              {selItem.sizes.length > 0 ? (
                <>
                  <select className="input text-sm" value={addSizeId} onChange={(e) => setAddSizeId(e.target.value)}>
                    {selItem.sizes.map((s) => <option key={s.id} value={s.id}>{s.size_name}</option>)}
                  </select>
                  {!showAddSize && (
                    <button type="button" onClick={() => setShowAddSize(true)} className="mt-0.5 text-xs text-purple-600 hover:underline">+ Add size</button>
                  )}
                  {showAddSize && (
                    <div className="mt-1 flex gap-1 items-center">
                      <input className="input text-xs py-1 w-20" placeholder="Name" value={newSizeName} onChange={(e) => setNewSizeName(e.target.value)} />
                      <button type="button" onClick={saveNewSize} className="text-xs text-purple-600 font-medium hover:underline">Save</button>
                      <button type="button" onClick={() => { setShowAddSize(false); setSizeError(''); }} className="text-xs text-gray-400 hover:underline">✕</button>
                    </div>
                  )}
                  {sizeError && <p className="text-xs text-red-500">{sizeError}</p>}
                </>
              ) : (
                <div className="text-xs text-gray-400 pt-1">
                  {showAddSize ? (
                    <div className="flex gap-1 items-center">
                      <input className="input text-xs py-1 w-20" placeholder="New size" value={newSizeName} onChange={(e) => setNewSizeName(e.target.value)} />
                      <button type="button" onClick={saveNewSize} className="text-xs text-purple-600 font-medium">Save</button>
                      <button type="button" onClick={() => setShowAddSize(false)} className="text-xs text-gray-400">✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowAddSize(true)} className="text-xs text-purple-600 hover:underline">+ Add size</button>
                  )}
                  {sizeError && <p className="text-red-500">{sizeError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Colour — always shown when item has colors */}
          {selItem && (
            <div className="min-w-[100px] flex-1">
              <label className="label text-xs">Colour</label>
              {selItem.colors.length > 0 ? (
                <>
                  <select className="input text-sm" value={addColorId} onChange={(e) => setAddColorId(e.target.value)}>
                    {selItem.colors.map((c) => <option key={c.id} value={c.id}>{c.color_name}</option>)}
                  </select>
                  {!showAddColor && (
                    <button type="button" onClick={() => setShowAddColor(true)} className="mt-0.5 text-xs text-purple-600 hover:underline">+ Add colour</button>
                  )}
                  {showAddColor && (
                    <div className="mt-1 flex gap-1 items-center">
                      <input className="input text-xs py-1 w-20" placeholder="Name" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} />
                      <button type="button" onClick={saveNewColor} className="text-xs text-purple-600 font-medium hover:underline">Save</button>
                      <button type="button" onClick={() => { setShowAddColor(false); setColorError(''); }} className="text-xs text-gray-400 hover:underline">✕</button>
                    </div>
                  )}
                  {colorError && <p className="text-xs text-red-500">{colorError}</p>}
                </>
              ) : (
                <div className="text-xs text-gray-400 pt-1">
                  {showAddColor ? (
                    <div className="flex gap-1 items-center">
                      <input className="input text-xs py-1 w-20" placeholder="New colour" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} />
                      <button type="button" onClick={saveNewColor} className="text-xs text-purple-600 font-medium">Save</button>
                      <button type="button" onClick={() => setShowAddColor(false)} className="text-xs text-gray-400">✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowAddColor(true)} className="text-xs text-purple-600 hover:underline">+ Add colour</button>
                  )}
                  {colorError && <p className="text-red-500">{colorError}</p>}
                </div>
              )}
            </div>
          )}

          <div className="w-20">
            <label className="label text-xs">Qty</label>
            <input type="number" className="input text-sm" value={addQty} onChange={(e) => setAddQty(e.target.value)} min="0.001" step="0.001" />
          </div>
          <div className="w-28">
            <label className="label text-xs">Rate (₹)</label>
            <input type="number" className="input text-sm" value={addRate} onChange={(e) => setAddRate(e.target.value)} min="0" step="0.01" placeholder="0.00" />
          </div>
          <div className="pt-5">
            <button type="button" onClick={addLine} disabled={!addItemId || !addRate} className="btn-primary text-sm">+ Add</button>
          </div>
        </div>

        {lines.length > 0 && (
          <table className="w-full text-sm mb-4">
            <thead className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">GST</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, i) => {
                const lr = lineResults[i];
                const varLabel = [line.color_name, line.size_name]
                  .filter((v) => v && v !== 'None' && v !== 'Regular')
                  .join(' / ');
                return (
                  <tr key={line.key}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{line.item_name}</div>
                      {varLabel && <div className="text-xs text-gray-400">{varLabel}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" className="input w-16 text-right text-sm py-1"
                        value={line.quantity} min="0.001" step="0.001"
                        onChange={(e) => setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, quantity: parseFloat(e.target.value) || 1 } : l))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{formatInr(line.rate)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{line.gst_rate}%</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatInr(lr.totalAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Unmatched AI items — suggest adding as new products (#3) */}
        {unmatchedItems.length > 0 && (
          <div className="mb-4 space-y-2">
            {unmatchedItems.map((it, i) => (
              <div key={`${it.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  ⚠️ <span className="font-semibold">&ldquo;{it.name}&rdquo;</span> not found in your products
                  <span className="text-xs text-amber-600"> · {it.quantity} × ₹{it.rate}</span>
                </p>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => openProductModal(it)} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700">
                    Yes, Add Product
                  </button>
                  <button type="button" onClick={() => skipUnmatched(it)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <div className="w-60 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500"><span>CGST</span><span>{formatInr(totals.totalCgst)}</span></div>
            <div className="flex justify-between text-gray-500"><span>SGST</span><span>{formatInr(totals.totalSgst)}</span></div>
            <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span className="text-purple-700">{formatInr(totals.grandTotal)}</span></div>
          </div>
        </div>
      </div>

      {/* Add-new-product modal (#3) */}
      {productDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-none sm:rounded-xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-semibold text-gray-900">Add New Product</h3>
              <button type="button" onClick={() => setProductDraft(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label text-xs">Name *</label>
                <input className="input text-sm" value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Category</label>
                  <select className="input text-sm" value={pCategory} onChange={(e) => setPCategory(e.target.value)}>
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">GST Rate</label>
                  <select className="input text-sm" value={pGst} onChange={(e) => setPGst(e.target.value)}>
                    {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">HSN Code</label>
                  <input className="input text-sm" value={pHsn} onChange={(e) => setPHsn(e.target.value)} maxLength={10} />
                </div>
                <div>
                  <label className="label text-xs">Unit</label>
                  <select className="input text-sm" value={pUnit} onChange={(e) => setPUnit(e.target.value)}>
                    {['pcs', 'meter', 'kg', 'roll', 'box', 'set', 'pair'].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Sale Price (₹)</label>
                  <input type="number" className="input text-sm" value={pSalePrice} onChange={(e) => setPSalePrice(e.target.value)} min="0" step="0.01" />
                </div>
              </div>
              {productError && <p className="text-xs text-red-600">{productError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setProductDraft(null)} className="btn-secondary text-sm">Cancel</button>
                <button type="button" onClick={saveNewProduct} disabled={savingProduct || !pName.trim()} className="btn-primary text-sm">
                  {savingProduct ? 'Saving…' : 'Save Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={pending || lines.length === 0 || (!supplierId && !showNewSupplier)} className="btn-primary">
          {pending ? 'Saving…' : 'Save Purchase Invoice'}
        </button>
      </div>
    </form>
  );
}
