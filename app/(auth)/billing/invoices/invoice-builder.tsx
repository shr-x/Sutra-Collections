'use client';

import { useState, useCallback, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import { calcLine, calcInvoiceTotals, formatInr } from '@/lib/gst';
import type { ActionResult, LineItemDraft, DiscountType } from '@/types';
import ItemPickerModal, { type PickerAddEvent } from '@/components/item-picker-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import DatePicker from '@/components/date-picker';
import { quickCreateCustomerAction } from '@/app/(auth)/customers/actions';
import { sendInvoiceWhatsAppAction } from './actions';

interface ItemOption {
  id: string;
  name: string;
  unit: string;
  gst_rate: number;
  hsn_code: string | null;
  item_type: string;
  category_id?: string | null;
  sale_price?: number | null;
  variants: { id: string; size: string | null; color: string | null; sku: string | null }[];
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  credit_limit: number;
  loyalty_points_balance?: number;
}

interface WarehouseOption {
  id: string;
  name: string;
}

interface DiscountScheme {
  id: string;
  scheme_type: string;
  buy_item_id: string | null;
  buy_quantity: number;
  get_item_id: string | null;
  get_quantity: number;
  discount_value: number | null;
  min_order_value?: number | null;
  name: string;
  // Item/category scoping (#discount-scoping): empty on both = applies to all items.
  item_ids?: string[];
  category_ids?: string[];
}

interface InvoiceBuilderProps {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  items?: ItemOption[];
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  defaultWarehouseId: string | null;
  isScheme?: boolean;
  loyaltyRedemptionRate?: number;
  discountSchemes?: DiscountScheme[];
  // Only the invoice CREATION flow shows the post-save "Send Invoice" WhatsApp
  // format dialog — the edit flow reuses this same component but redirects
  // itself, so it never sets this.
  showSendDialog?: boolean;
  initialData?: {
    customer_id?: string;
    warehouse_id?: string;
    invoice_date?: string;
    due_date?: string;
    invoice_type?: string;
    is_scheme_invoice?: boolean;
    payment_mode?: string;
    amount_paid?: number;
    invoice_discount_type?: string;
    invoice_discount_value?: number;
    is_recurring?: boolean;
    recurring_frequency?: string;
    notes?: string;
    lines?: LineItemDraft[];
    // Discounts persisted on the invoice, reloaded on edit (#3)
    loyalty_points_redeemed?: number;
    scheme_discount_amount?: number;
    loyalty_discount_amount?: number;
  };
}

function variantLabel(v: { size: string | null; color: string | null; sku: string | null } | null): string {
  if (!v) return '';
  return [v.color, v.size].filter(Boolean).join(' / ') || v.sku || '';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAYMENT_MODES = [
  { value: 'cash',   label: 'Cash'   },
  { value: 'upi',    label: 'UPI'    },
  { value: 'credit', label: 'Credit' },
];

let keyCounter = 0;
function nextKey() { return `line-${++keyCounter}`; }

export default function InvoiceBuilder({
  action,
  items,
  customers,
  warehouses,
  defaultWarehouseId,
  isScheme = false,
  // loyaltyRedemptionRate intentionally not destructured — redemption is a fixed
  // 1 pt = ₹1 (see loyaltyDiscountAmt below). The prop remains in the interface
  // for backward compatibility with the page that passes it.
  discountSchemes = [],
  initialData,
  showSendDialog = false,
}: InvoiceBuilderProps) {
  const router = useRouter();
  const [state, formAction] = useFormState<ActionResult, FormData>(action, { success: false });
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);

  // ── Post-save "Send Invoice" WhatsApp format dialog (create flow only) ──────
  const [sendDialogOrderId, setSendDialogOrderId] = useState<string | null>(null);
  const [sendFormat, setSendFormat] = useState<'thermal' | 'a4'>('thermal');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const handledStateRef = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!showSendDialog) return;
    if (state === handledStateRef.current) return;
    handledStateRef.current = state;
    const invoiceId = (state.data as { invoiceId?: string } | undefined)?.invoiceId;
    if (state.success && invoiceId) {
      setSendDialogOrderId(invoiceId);
    }
  }, [state, showSendDialog]);

  function closeSendDialog(navigate = true) {
    const invoiceId = sendDialogOrderId;
    setSendDialogOrderId(null);
    setSendError(null);
    if (navigate && invoiceId) router.push(`/billing/invoices/${invoiceId}`);
  }

  function handleSendInvoice() {
    if (!sendDialogOrderId) return;
    setSending(true);
    setSendError(null);
    const invoiceId = sendDialogOrderId;
    sendInvoiceWhatsAppAction(invoiceId, sendFormat)
      .then((res) => {
        setSending(false);
        if (res.success) {
          closeSendDialog(true);
        } else {
          setSendError(res.error ?? 'Failed to send WhatsApp message.');
        }
      })
      .catch(() => {
        setSending(false);
        setSendError('Failed to send WhatsApp message.');
      });
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── Invoice header state ─────────────────────────────────────────────────────
  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoice_date ?? today);
  const [showDateInput, setShowDateInput] = useState(false);
  const [invoiceType, setInvoiceType] = useState(initialData?.invoice_type ?? 'gst');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [showNotes, setShowNotes] = useState(!!(initialData?.notes));

  // ── Warehouse with localStorage ──────────────────────────────────────────────
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouse_id ?? defaultWarehouseId ?? '');
  const [showWarehouseDrop, setShowWarehouseDrop] = useState(false);
  const warehouseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialData?.warehouse_id && !defaultWarehouseId) {
      const saved = localStorage.getItem('last_warehouse_id');
      if (saved && warehouses.some((w) => w.id === saved)) setWarehouseId(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id);
    localStorage.setItem('last_warehouse_id', id);
    setShowWarehouseDrop(false);
  };

  // ── Customer search ──────────────────────────────────────────────────────────
  const initCustomer = initialData?.customer_id
    ? customers.find((c) => c.id === initialData?.customer_id)
    : null;
  const [customerId, setCustomerId] = useState(initialData?.customer_id ?? '');
  const [customerSearch, setCustomerSearch] = useState(
    initCustomer
      ? `${initCustomer.name}${initCustomer.phone ? ` · ${initCustomer.phone}` : ''}`
      : ''
  );
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);

  // ── Payment state ────────────────────────────────────────────────────────────
  const [paymentMode, setPaymentMode] = useState(initialData?.payment_mode ?? '');
  const [paymentModeError, setPaymentModeError] = useState('');
  const [amountPaid, setAmountPaid] = useState(initialData?.amount_paid ?? 0);
  const [invDiscType, setInvDiscType] = useState<DiscountType | ''>((initialData?.invoice_discount_type as DiscountType) ?? '');
  const [invDiscValue, setInvDiscValue] = useState(initialData?.invoice_discount_value ?? 0);
  const [showDiscount, setShowDiscount] = useState(!!(initialData?.invoice_discount_type));
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring ?? false);
  const [recurringFreq, setRecurringFreq] = useState(initialData?.recurring_frequency ?? '');
  // Pre-populate redeemed points when editing an existing invoice (#3)
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(initialData?.loyalty_points_redeemed ?? 0);

  // ── Item-add fields ──────────────────────────────────────────────────────────
  const [lines, setLines] = useState<LineItemDraft[]>(initialData?.lines ?? []);
  // Tracks whether the user has modified line items since load (used so a saved
  // scheme discount can be reloaded on edit but recomputed once items change).
  const linesTouchedRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);

  // ── Outside-click handlers ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDrop(false);
      }
      if (warehouseRef.current && !warehouseRef.current.contains(e.target as Node)) {
        setShowWarehouseDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset redeemed points when the customer changes — but NOT on the initial
  // mount, so a reloaded invoice (#3) keeps its saved redemption.
  const customerInitRef = useRef(true);
  useEffect(() => {
    if (customerInitRef.current) { customerInitRef.current = false; return; }
    setLoyaltyPointsToRedeem(0);
  }, [customerId]);
  useEffect(() => { setIsPending(false); }, [state]);

  // ── Customer outstanding dues ─────────────────────────────────────────────
  const [customerDues, setCustomerDues] = useState<{
    totalDue: number;
    invoices: Array<{ id: string; invoice_number: string; invoice_date: string; balance_due: string }>;
  } | null>(null);
  const [duesAcknowledged, setDuesAcknowledged] = useState(false);

  useEffect(() => {
    setDuesAcknowledged(false);
    setCustomerDues(null);
    if (!customerId) return;
    fetch(`/api/customers/${customerId}/outstanding`)
      .then((r) => r.json())
      .then((data) => { if (data.totalDue > 0) setCustomerDues(data); })
      .catch(() => {});
  }, [customerId]);

  // ── Totals ───────────────────────────────────────────────────────────────────
  const lineResults = lines.map((l) =>
    calcLine({
      quantity: l.quantity,
      rate: l.rate,
      discountType: l.discount_type,
      discountValue: l.discount_value ?? 0,
      gstRate: l.gst_rate,
      isScheme,
    })
  );
  const totals = calcInvoiceTotals(lineResults, {
    discountType: invDiscType || null,
    discountValue: invDiscValue,
  });

  // ── BOGO scheme evaluation ───────────────────────────────────────────────────
  // Root cause of the old "BOGO not applying" bug: buy_x_get_y schemes store the
  // free item via get_item_id/get_quantity and leave discount_value NULL. The old
  // code multiplied by Number(discount_value) → Number(null) = 0 → ₹0 discount.
  // Correct model: the discount is the VALUE of the free get-items, i.e.
  // (free units) × (unit price of the get item from its cart line).
  const computedBogo = discountSchemes
    .filter((s) => s.scheme_type === 'buy_x_get_y')
    .reduce((total, scheme) => {
      const buyQty = Number(scheme.buy_quantity) || 0;
      const getQty = Number(scheme.get_quantity) || 0;
      if (buyQty <= 0 || getQty <= 0) return total;

      // Check min_order_value against current cart subtotal
      const minOrder = Number(scheme.min_order_value) || 0;
      if (minOrder > 0 && totals.grandTotal < minOrder) return total;

      // "Any item" mode: buy_item_id is NULL → apply to total cart quantity
      if (!scheme.buy_item_id) {
        const totalCartQty = lines.reduce((sum, l) => sum + l.quantity, 0);
        if (totalCartQty < buyQty) return total;
        const freeUnits = Math.floor(totalCartQty / (buyQty + getQty)) * getQty;
        if (freeUnits <= 0) return total;
        // Discount = free units × average unit price across all cart lines
        const cartValue = lines.reduce((sum, l) => sum + l.rate * l.quantity, 0);
        const avgPrice = totalCartQty > 0 ? cartValue / totalCartQty : 0;
        const disc = Math.round(freeUnits * avgPrice * 100) / 100;
        return total + disc;
      }

      const discVal = Number(scheme.discount_value) || 0;
      const getItemId = scheme.get_item_id ?? scheme.buy_item_id;
      const buyQtyInCart = lines
        .filter((l) => l.item_id === scheme.buy_item_id)
        .reduce((sum, l) => sum + l.quantity, 0);
      // Unit price of the free item, taken from its line in the cart
      const getLine = lines.find((l) => l.item_id === getItemId);
      const getUnitPrice = getLine ? getLine.rate : 0;
      // Per-free-unit benefit: explicit discount_value if the scheme sets one,
      // otherwise the full price of the get item (truly "free").
      const perUnit = discVal > 0 ? discVal : getUnitPrice;

      let freeUnits = 0;
      if (getItemId === scheme.buy_item_id) {
        // Same item (classic "buy 1 get 1"): every (buy+get) units → getQty free
        freeUnits = Math.floor(buyQtyInCart / (buyQty + getQty)) * getQty;
      } else {
        if (buyQtyInCart < buyQty) return total;
        const cycles = Math.floor(buyQtyInCart / buyQty);
        const getQtyInCart = lines
          .filter((l) => l.item_id === getItemId)
          .reduce((sum, l) => sum + l.quantity, 0);
        freeUnits = Math.min(cycles * getQty, getQtyInCart);
      }

      const disc = freeUnits * perUnit;
      return total + disc;
    }, 0);

  // Auto-apply flat (₹) / percent (%) / seasonal discount schemes at the CART
  // level — but only ones with NO item/category scoping (empty scoping = applies
  // to all items, the backward-compatible default every scheme had before item/
  // category scoping existed). Scoped schemes are applied PER LINE ITEM instead
  // (see itemLineDiscount below) so they only affect the items/categories they
  // target, not the whole cart.
  const isUnscoped = (s: DiscountScheme) => !(s.item_ids?.length) && !(s.category_ids?.length);
  const cartSubtotal = totals.grandTotal;
  const computedFlatPct = discountSchemes
    .filter((s) => (s.scheme_type === 'flat' || s.scheme_type === 'percent' || s.scheme_type === 'seasonal') && isUnscoped(s))
    .reduce((sum, scheme) => {
      const minOrder = Number(scheme.min_order_value) || 0;
      if (cartSubtotal < minOrder) return sum;
      const discVal = Number(scheme.discount_value) || 0;
      if (scheme.scheme_type === 'flat') {
        return sum + discVal;
      }
      return sum + Math.round(cartSubtotal * discVal / 100 * 100) / 100;
    }, 0);

  // Per-line scoped discounts (#discount-scoping): a scheme with item_ids/
  // category_ids scopes itself to only those lines. Multiple matching schemes
  // on the same line STACK additively — mirrors the existing cart-level
  // behavior above (which already sums multiple qualifying schemes rather than
  // picking a single "best" one), so this preserves that precedent instead of
  // introducing a different rule for scoped schemes.
  const itemLineDiscount = useCallback((itemId: string, categoryId: string | null | undefined, grossAmount: number) => {
    let amount = 0;
    const labels: string[] = [];
    for (const s of discountSchemes) {
      if (s.scheme_type !== 'flat' && s.scheme_type !== 'percent' && s.scheme_type !== 'seasonal') continue;
      if (isUnscoped(s)) continue;
      const matchesItem = s.item_ids?.includes(itemId);
      const matchesCategory = categoryId != null && s.category_ids?.includes(categoryId);
      if (!matchesItem && !matchesCategory) continue;
      const minOrder = Number(s.min_order_value) || 0;
      if (cartSubtotal < minOrder) continue;
      const discVal = Number(s.discount_value) || 0;
      if (discVal <= 0) continue;
      const disc = s.scheme_type === 'flat' ? discVal : Math.round(grossAmount * discVal / 100 * 100) / 100;
      amount += disc;
      labels.push(`${s.name} -${s.scheme_type === 'flat' ? formatInr(discVal) : `${discVal}%`}`);
    }
    return { amount, label: labels.join(', ') };
  }, [discountSchemes, cartSubtotal]);

  const itemCategoryMap: Record<string, string | null> = {};
  for (const it of items ?? []) itemCategoryMap[it.id] = it.category_id ?? null;

  // Sum of per-line scoped discounts across the cart — folded into the same
  // "Scheme Discount" total as BOGO/unscoped flat/percent schemes below (kept
  // as one aggregate the way the rest of this component already treats scheme
  // discounts: subtracted from the payable total, not from the taxable/GST base).
  const computedScopedItemDiscount = lines.reduce(
    (sum, l) => sum + itemLineDiscount(l.item_id, itemCategoryMap[l.item_id], l.rate * l.quantity).amount,
    0
  );

  const totalComputedSchemeDiscount = computedBogo + computedFlatPct + computedScopedItemDiscount;

  // On edit (#3): reload the saved scheme discount until the user touches the
  // line items. Once items change, the live recomputation above takes over.
  const bogoDiscountAmount =
    totalComputedSchemeDiscount > 0
      ? totalComputedSchemeDiscount
      : !linesTouchedRef.current
      ? (initialData?.scheme_discount_amount ?? 0)
      : 0;

  // Locally-extendable customer list so a new customer created inline (#5)
  // appears immediately without a page reload.
  const [extraCustomers, setExtraCustomers] = useState<CustomerOption[]>([]);
  const allCustomers = [...customers, ...extraCustomers];

  const selectedCustomer   = allCustomers.find((c) => c.id === customerId);
  // On edit (#3) the points redeemed on THIS invoice were already deducted from
  // the balance at creation, so add them back into the selectable pool for the
  // original customer — otherwise the reloaded redemption would be clamped away.
  const reservedPoints     = initialData?.customer_id && customerId === initialData.customer_id
    ? (initialData?.loyalty_points_redeemed ?? 0) : 0;
  const customerPoints     = (selectedCustomer?.loyalty_points_balance ?? 0) + reservedPoints;

  // ── Discount stacking (#2, #5) ───────────────────────────────────────────────
  // Order: line/invoice totals → scheme (BOGO) discount → loyalty discount.
  // Loyalty is a fixed 1 pt = ₹1 and is capped at the POST-SCHEME total so it can
  // never discount more than what is owed after BOGO.
  const postSchemeTotal     = Math.max(0, totals.grandTotal - bogoDiscountAmount);
  const maxRedeemablePoints = Math.min(customerPoints, Math.floor(postSchemeTotal));
  const loyaltyDiscountAmt  = Math.min(loyaltyPointsToRedeem, postSchemeTotal); // 1 pt = ₹1
  // Grand Total = Subtotal − Scheme Discount − Loyalty Discount
  const effectiveGrandTotal = Math.max(0, postSchemeTotal - loyaltyDiscountAmt);
  // Loyalty already reduces the grand total, so the cash/UPI tendered equals it.
  const cashDue            = effectiveGrandTotal;
  const balance            = Math.max(0, effectiveGrandTotal - amountPaid);

  // Keep amountPaid (the cash/UPI tendered) in sync with the final grand total.
  useEffect(() => {
    if (paymentMode === 'cash' || paymentMode === 'upi') {
      setAmountPaid(cashDue);
    }
  }, [cashDue, paymentMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the cart shrinks below the redeemed points, clamp them down (#5).
  useEffect(() => {
    if (loyaltyPointsToRedeem > maxRedeemablePoints) {
      setLoyaltyPointsToRedeem(maxRedeemablePoints);
    }
  }, [maxRedeemablePoints, loyaltyPointsToRedeem]);

  // BOGO toast (#2): pop a notification when a scheme discount first applies.
  const [bogoToast, setBogoToast] = useState<string | null>(null);
  const prevBogoRef = useRef(0);
  useEffect(() => {
    if (bogoDiscountAmount > 0 && prevBogoRef.current === 0) {
      setBogoToast(`🎉 Scheme applied! You saved ${formatInr(bogoDiscountAmount)}`);
      const t = setTimeout(() => setBogoToast(null), 3000);
      prevBogoRef.current = bogoDiscountAmount;
      return () => clearTimeout(t);
    }
    prevBogoRef.current = bogoDiscountAmount;
  }, [bogoDiscountAmount]);

  // Customer search helpers
  const filteredCustomers = customerSearch.length >= 1 && !customerId
    ? allCustomers
        .filter((c) =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          (c.phone && c.phone.includes(customerSearch))
        )
        .slice(0, 8)
    : [];

  const selectCustomer = (c: CustomerOption) => {
    setCustomerId(c.id);
    setCustomerSearch(`${c.name}${c.phone ? ` · ${c.phone}` : ''}`);
    setShowCustomerDrop(false);
  };
  const clearCustomer = () => { setCustomerId(''); setCustomerSearch(''); setShowCustomerDrop(false); };

  // ── Inline new-customer creation (#5) ────────────────────────────────────────
  const [newCustName, setNewCustName] = useState('');
  const [creatingCust, setCreatingCust] = useState(false);
  const [newCustError, setNewCustError] = useState('');
  // If the search box holds a phone number, capture it for the new customer.
  const searchIsPhone = /^[\d\s+\-]{5,}$/.test(customerSearch.trim());
  const searchDigits = customerSearch.replace(/[^\d]/g, '');

  const handleQuickCreate = async () => {
    const name = newCustName.trim();
    if (!name) { setNewCustError('Enter a name'); return; }
    setNewCustError('');
    setCreatingCust(true);
    const phone = searchIsPhone ? searchDigits : '';
    const res = await quickCreateCustomerAction(name, phone);
    setCreatingCust(false);
    if (res.success && res.id) {
      const c: CustomerOption = {
        id: res.id,
        name: res.name ?? name,
        phone: res.phone ?? (phone || null),
        credit_limit: 0,
        loyalty_points_balance: 0,
      };
      setExtraCustomers((prev) => [...prev, c]);
      selectCustomer(c);
      setNewCustName('');
    } else {
      setNewCustError(res.error ?? 'Failed to create customer');
    }
  };

  // Auto-fill amount_paid when payment mode changes
  const togglePaymentMode = (mode: string) => {
    if (paymentMode === mode) {
      setPaymentMode('');
      setAmountPaid(0);
    } else {
      setPaymentMode(mode);
      if (mode === 'cash' || mode === 'upi') {
        setAmountPaid(cashDue);
      } else {
        setAmountPaid(0);
      }
    }
  };

  // ── Line management ──────────────────────────────────────────────────────────
  const addLineFromModal = useCallback((event: PickerAddEvent) => {
    linesTouchedRef.current = true;
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        item_id: event.item_id,
        item_name: event.item_name,
        variant_id: null,
        variant_label: null,
        size_id: event.size_id,
        color_id: event.color_id,
        size_label: event.size_label,
        color_label: event.color_label,
        quantity: event.quantity,
        rate: event.rate,
        discount_type: null,
        discount_value: null,
        hsn_code: event.hsn_code,
        gst_rate: event.gst_rate,
        stock_qty: event.stock_qty,
      },
    ]);
  }, []);

  const removeLine = (key: string) => {
    linesTouchedRef.current = true;
    setLines((prev) => prev.filter((l) => l.key !== key));
  };
  const confirmRemoveLine = lines.find((l) => l.key === confirmRemoveKey);
  const updateLine = (key: string, field: keyof LineItemDraft, value: string | number | null) => {
    linesTouchedRef.current = true;
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentMode) {
      setPaymentModeError('Please select a payment mode before saving.');
      return;
    }
    setPaymentModeError('');
    const fd = new FormData();
    fd.set('payload', JSON.stringify({
      customer_id:             customerId || null,
      warehouse_id:            warehouseId,
      invoice_date:            invoiceDate,
      due_date:                null,
      invoice_type:            invoiceType,
      is_scheme_invoice:       isScheme,
      payment_mode:            paymentMode || null,
      amount_paid:             amountPaid,
      invoice_discount_type:   invDiscType || null,
      invoice_discount_value:  invDiscValue || null,
      // NOTE: was `computedBogo` (BOGO only) — that silently dropped the
      // cart-level flat/percent/seasonal scheme discount (and now the new
      // per-item scoped discount) from the saved invoice total, even though
      // both were already shown to the cashier/customer on screen. Sending
      // the full aggregate here is what actually persists them.
      bogo_discount_amount:    bogoDiscountAmount,
      is_recurring:            isRecurring,
      recurring_frequency:     recurringFreq || null,
      notes:                   notes || null,
      loyalty_points_redeemed: loyaltyPointsToRedeem,
      items: lines.map((l) => ({
        item_id:        l.item_id,
        variant_id:     l.variant_id,
        size_id:        l.size_id,
        color_id:       l.color_id,
        quantity:       l.quantity,
        rate:           l.rate,
        discount_type:  l.discount_type,
        discount_value: l.discount_value,
        hsn_code:       l.hsn_code,
        gst_rate:       l.gst_rate,
      })),
    }));
    setIsPending(true);
    startTransition(() => formAction(fd));
  };

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">
      {/* BOGO scheme toast (#2) — top-center, auto-dismiss after 3s */}
      {bogoToast && (
        <div className="fixed left-1/2 top-6 z-[60] -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-purple-700/30">
            {bogoToast}
          </div>
        </div>
      )}

      {/* Error banner */}
      {state.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* ── TOP CONTROLS: date + invoice type + warehouse ─────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: date */}
        <div className="flex items-center gap-2">
          {showDateInput ? (
            <DatePicker
              value={invoiceDate}
              onChange={(v) => { setInvoiceDate(v); setShowDateInput(false); }}
              className="input text-sm py-1 w-36"
            />
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-gray-700">
              {fmtDate(invoiceDate)}
              <button
                type="button"
                onClick={() => setShowDateInput(true)}
                className="rounded p-0.5 text-base text-gray-400 transition-colors hover:text-purple-600"
                title="Change date"
              >
                📅
              </button>
            </span>
          )}
          {isScheme && (
            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
              Scheme — GST exclusive
            </span>
          )}
        </div>

        {/* Right: invoice type toggle + warehouse picker */}
        <div className="flex items-center gap-2">
          {/* Invoice type */}
          <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs font-medium">
            <button
              type="button"
              onClick={() => setInvoiceType('gst')}
              className={`px-3 py-1.5 transition-colors ${
                invoiceType === 'gst'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              GST
            </button>
            <button
              type="button"
              onClick={() => setInvoiceType('non_gst')}
              className={`border-l px-3 py-1.5 transition-colors ${
                invoiceType === 'non_gst'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Non-GST
            </button>
          </div>

          {/* Warehouse picker */}
          <div ref={warehouseRef} className="relative">
            <button
              type="button"
              onClick={() => setShowWarehouseDrop((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                !warehouseId
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {selectedWarehouse?.name ?? 'Select warehouse'}
              <span className="text-gray-400">▾</span>
            </button>
            {showWarehouseDrop && (
              <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-gray-200 bg-white shadow-lg">
                {warehouses.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`block w-full px-4 py-2 text-left text-xs hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      warehouseId === w.id ? 'font-semibold text-purple-700' : 'text-gray-700'
                    }`}
                    onClick={() => handleWarehouseChange(w.id)}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CUSTOMER ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="mb-3 font-semibold text-gray-900">Customer</h2>
        <div ref={customerRef} className="relative max-w-lg">
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="Search by name or phone number…"
              value={customerSearch}
              autoComplete="off"
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerId('');
                setShowCustomerDrop(true);
              }}
              onFocus={() => { if (!customerId) setShowCustomerDrop(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowCustomerDrop(false);
                if (e.key === 'Enter' && showCustomerDrop && filteredCustomers.length > 0) {
                  e.preventDefault();
                  selectCustomer(filteredCustomers[0]);
                }
              }}
            />
            {(customerId || customerSearch) && (
              <button
                type="button"
                onClick={clearCustomer}
                className="px-2 text-gray-400 hover:text-red-500 text-lg leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {customerId && selectedCustomer ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              {selectedCustomer.phone ?? 'No phone'} · Credit limit:{' '}
              {selectedCustomer.credit_limit > 0 ? `₹${selectedCustomer.credit_limit}` : 'None'}
            </div>
          ) : !customerSearch ? (
            <p className="mt-1 text-xs text-gray-400">Leave blank for walk-in</p>
          ) : null}

          {showCustomerDrop && customerSearch.length >= 1 && !customerId && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-purple-50 first:rounded-t-lg last:rounded-b-lg"
                    onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.phone ?? 'No phone'}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-500 mb-2">
                    No customer found.{' '}
                    <span className="font-medium text-gray-700">New customer?</span>
                  </p>
                  {searchIsPhone && (
                    <p className="text-xs text-gray-400 mb-1.5">Phone: {searchDigits}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus
                      className="input flex-1 text-sm py-1.5"
                      placeholder="Enter customer name…"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleQuickCreate(); }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      disabled={creatingCust || !newCustName.trim()}
                      onMouseDown={(e) => { e.preventDefault(); handleQuickCreate(); }}
                      className="shrink-0 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
                    >
                      {creatingCust ? 'Saving…' : 'Save & Continue'}
                    </button>
                  </div>
                  {newCustError && <p className="mt-1 text-xs text-red-600">{newCustError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Customer outstanding dues banner */}
      {customerDues && !duesAcknowledged && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-4">
          <p className="font-semibold text-red-800 text-sm">
            ⚠ {selectedCustomer?.name ?? 'Customer'} has outstanding dues of Rs.{customerDues.totalDue.toFixed(0)}
          </p>
          <ul className="mt-2 space-y-1">
            {customerDues.invoices.map((inv) => (
              <li key={inv.id} className="text-xs text-red-700 flex justify-between">
                <span className="font-mono">{inv.invoice_number}</span>
                <span>{new Date(inv.invoice_date).toLocaleDateString('en-IN')}</span>
                <span className="font-semibold">Rs.{Number(inv.balance_due).toFixed(0)} due</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setDuesAcknowledged(true)}
              className="rounded-lg bg-red-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-800"
            >
              Acknowledge &amp; Continue
            </button>
            <a
              href="/customers/dues"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-red-400 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              View Dues
            </a>
          </div>
        </div>
      )}

      {/* Item picker modal */}
      <ItemPickerModal
        open={modalOpen}
        warehouseId={warehouseId}
        onAdd={addLineFromModal}
        onClose={() => setModalOpen(false)}
      />
      <ConfirmDialog
        open={confirmRemoveKey !== null}
        title="Remove Item"
        message={`Remove "${confirmRemoveLine?.item_name ?? ''}" from this invoice?`}
        confirmLabel="Remove"
        onConfirm={() => { removeLine(confirmRemoveKey!); setConfirmRemoveKey(null); }}
        onCancel={() => setConfirmRemoveKey(null)}
      />

      {/* ── ITEMS ────────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Items</h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={!warehouseId}
            className="flex items-center gap-2 rounded-xl border-2 border-dashed border-purple-300 px-4 py-2 text-sm font-medium text-purple-600 transition-all hover:border-purple-500 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-base leading-none">+</span> Select Item
          </button>
        </div>
        {!warehouseId && (
          <p className="mb-2 text-xs text-amber-600">⚠ Select a warehouse (top-right) before adding items</p>
        )}

        {/* Line items table */}
        {lines.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full text-sm mb-3">
            <thead className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-right w-28">Rate</th>
                <th className="px-3 py-2 text-right w-16">GST</th>
                <th className="px-3 py-2 text-right w-24">Total</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, i) => {
                const lr = lineResults[i];
                const scopedDisc = itemLineDiscount(line.item_id, itemCategoryMap[line.item_id], line.rate * line.quantity);
                return (
                  <tr key={line.key} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{line.item_name}</div>
                      {lr.discountAmount > 0 && (
                        <div className="text-xs text-red-500">-{formatInr(lr.discountAmount)} disc.</div>
                      )}
                      {scopedDisc.amount > 0 && (
                        <div className="text-xs text-red-500" title={scopedDisc.label}>
                          -{formatInr(scopedDisc.amount)} · {scopedDisc.label}
                        </div>
                      )}
                      {(() => {
                        const parts = [line.color_label, line.size_label]
                          .filter((v) => v && v !== 'None' && v !== 'Regular');
                        const label = parts.join(' / ') || line.variant_label;
                        return label ? <div className="text-xs text-gray-400">{label}</div> : null;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        className={`input w-16 text-right text-sm py-1 ${
                          line.stock_qty != null && line.quantity > line.stock_qty
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-300'
                            : ''
                        }`}
                        value={line.quantity}
                        min="0.001"
                        step="0.001"
                        onChange={(e) => updateLine(line.key, 'quantity', parseFloat(e.target.value) || 1)}
                      />
                      {line.stock_qty != null && line.quantity > line.stock_qty && (
                        <p className="mt-0.5 text-xs text-red-500">
                          Only {line.stock_qty} in stock
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        className="input w-24 text-right text-sm py-1"
                        value={line.rate}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateLine(line.key, 'rate', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{line.gst_rate}%</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatInr(lr.totalAmount)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveKey(line.key)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">No items added yet.</p>
        )}

        {/* Notes toggle */}
        {showNotes ? (
          <div className="mt-2 flex items-start gap-2">
            <textarea
              className="input text-sm flex-1 h-16 resize-none"
              placeholder="Note on invoice…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
            <button
              type="button"
              onClick={() => { setShowNotes(false); setNotes(''); }}
              className="text-gray-400 hover:text-red-500 mt-1 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-purple-400 hover:text-purple-600"
          >
            + Add Note
          </button>
        )}
      </div>

      {/* ── PAYMENT + TOTALS ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Payment controls */}
          <div className="flex-1 space-y-3">
            <div>
              <p className="label text-xs mb-1">Payment</p>
              <div className="flex gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => togglePaymentMode(m.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      paymentMode === m.value
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {paymentModeError && (
                <p className="mt-1 text-xs text-red-600">{paymentModeError}</p>
              )}
            </div>


            {/* Loyalty points */}
            {customerId && customerPoints > 0 && (
              <div style={{ background: '#f5f0ff', border: '1px solid #e0d0ff' }} className="rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-purple-800">🎁 Loyalty Points</span>
                  <span className="text-sm font-semibold text-purple-700">
                    {customerPoints.toLocaleString('en-IN')} pts
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-600">Redeem:</span>
                  <input
                    type="number"
                    min="0"
                    max={maxRedeemablePoints}
                    step={1}
                    value={loyaltyPointsToRedeem || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = parseInt(e.target.value) || 0;
                      const clamped = Math.min(Math.max(0, raw), maxRedeemablePoints);
                      setLoyaltyPointsToRedeem(clamped);
                    }}
                    className="input w-20 text-sm text-right py-1"
                  />
                  <span className="text-xs text-gray-600">pts</span>
                  <button
                    type="button"
                    onClick={() => setLoyaltyPointsToRedeem(maxRedeemablePoints)}
                    className="rounded border border-purple-400 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                  >
                    Max
                  </button>
                  <span className="text-xs font-bold text-green-600">
                    = {loyaltyPointsToRedeem > 0 ? `-${formatInr(loyaltyDiscountAmt)}` : '₹0 off'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-purple-400">₹100 spent = 1 pt • 1 pt = ₹1 off</p>
              </div>
            )}

            {/* Discount toggle */}
            {showDiscount ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label text-xs">Invoice Discount</label>
                  <select
                    className="input text-sm"
                    value={invDiscType}
                    onChange={(e) => setInvDiscType(e.target.value as DiscountType | '')}
                  >
                    <option value="">None</option>
                    <option value="flat">₹ Flat</option>
                    <option value="percent">% Percent</option>
                  </select>
                </div>
                {invDiscType && (
                  <div className="flex-1">
                    <label className="label text-xs">Value</label>
                    <input
                      type="number"
                      className="input text-sm"
                      value={invDiscValue}
                      min="0"
                      step="0.01"
                      onChange={(e) => setInvDiscValue(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setShowDiscount(false); setInvDiscType(''); setInvDiscValue(0); }}
                  className="text-gray-400 hover:text-red-500 pb-2"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDiscount(true)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-purple-400 hover:text-purple-600"
              >
                + Invoice Discount
              </button>
            )}

            {/* Recurring */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <label htmlFor="recurring" className="text-xs text-gray-500">Recurring invoice</label>
            </div>
            {isRecurring && (
              <select
                className="input text-sm"
                value={recurringFreq}
                onChange={(e) => setRecurringFreq(e.target.value)}
              >
                <option value="">Select frequency</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>

          {/* Totals */}
          <div className="w-full border-t border-gray-100 pt-4 space-y-1.5 text-sm sm:w-56 sm:shrink-0 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-6">
            {totals.invoiceDiscountAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>MRP Total</span>
                <span>{formatInr(totals.subtotal)}</span>
              </div>
            )}
            {totals.invoiceDiscountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>
                  {invDiscType === 'flat' ? 'Discount (₹)'
                    : invDiscType === 'percent' ? `Discount (${invDiscValue}%)`
                    : 'Discount'}
                </span>
                <span>-{formatInr(totals.invoiceDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatInr(totals.grandTotal - totals.totalCgst - totals.totalSgst)}</span>
            </div>
            {invoiceType === 'gst' && (
              <>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>CGST</span>
                  <span>{formatInr(totals.totalCgst)}</span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>SGST</span>
                  <span>{formatInr(totals.totalSgst)}</span>
                </div>
              </>
            )}
            {/* Scheme + loyalty discounts shown between subtotal and grand total */}
            {bogoDiscountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Scheme Discount</span>
                <span>-{formatInr(bogoDiscountAmount)}</span>
              </div>
            )}
            {loyaltyDiscountAmt > 0 && (
              <div className="flex justify-between text-purple-600">
                <span>Loyalty ({loyaltyPointsToRedeem} pts)</span>
                <span>-{formatInr(loyaltyDiscountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
              <span>Grand Total</span>
              <span className="text-purple-700">{formatInr(effectiveGrandTotal)}</span>
            </div>
            {totals.grandTotal > 50000 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                ⚠ E-Way bill required
              </p>
            )}
            {/* #4: no "Paid" line for cash/UPI (obvious). Show Payment Due in red
                whenever a balance remains (credit / partial). */}
            {balance > 0 && (
              <div className="flex justify-between font-semibold text-red-700 border-t border-gray-200 pt-2">
                <span>Payment Due</span>
                <span>{formatInr(balance)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || lines.length === 0 || !warehouseId || !paymentMode}
            className="btn-primary"
          >
            {isPending ? 'Saving…' : 'Save Invoice'}
          </button>
        </div>
      </div>
    </form>

    {sendDialogOrderId && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="mb-1 text-base font-semibold text-gray-900">Send Invoice</h3>
          <p className="mb-4 text-xs text-gray-500">Invoice saved. Send it to the customer over WhatsApp?</p>

          {sendError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{sendError}</div>
          )}

          <div className="mb-5">
            <p className="label text-xs mb-2">Format</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSendFormat('thermal')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  sendFormat === 'thermal'
                    ? 'border-purple-600 bg-purple-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                }`}
              >
                Thermal Receipt
              </button>
              <button
                type="button"
                onClick={() => setSendFormat('a4')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  sendFormat === 'a4'
                    ? 'border-purple-600 bg-purple-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400'
                }`}
              >
                A4 Invoice
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => closeSendDialog(true)}
              disabled={sending}
              className="flex-1 btn-secondary text-sm disabled:opacity-50"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSendInvoice}
              disabled={sending}
              className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send via WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
