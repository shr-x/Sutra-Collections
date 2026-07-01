// ─── Auth & Session ────────────────────────────────────────────────────────

export type Role = 'admin' | 'staff' | 'accountant';

export interface SessionPayload {
  userId: string;
  role: Role;
  warehouseId: string | null;
  sessionId: string;
  /** Unix ms timestamp — null means no expiry set */
  accessExpiresAt: number | null;
  name: string;
  email: string;
}

// ─── Database Row Types ────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  warehouse_id: string | null;
  access_expires_at: Date | null;
  created_at: Date;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: Date;
  last_active_at: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  gstin: string | null;
  whatsapp_opt_out: boolean;
  credit_limit: number;
  created_at: Date;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  address: string;
  created_at: Date;
}

export type ItemType = 'finished' | 'raw_material';

export interface ItemCategory {
  id: string;
  name: string;
  item_type: ItemType;
}

export interface ItemUnit {
  id: string;
  name: string;
}

export interface ItemSize {
  id: string;
  item_id: string;
  size_name: string;
  is_default: boolean;
  sort_order: number;
}

export interface ItemColor {
  id: string;
  item_id: string;
  color_name: string;
  is_default: boolean;
  sort_order: number;
}

export interface Item {
  id: string;
  name: string;
  hsn_code: string | null;
  item_type: ItemType;
  category_id: string | null;
  gst_rate: number;
  unit: string;
  is_active: boolean;
  low_stock_threshold: number | null;
  sale_price: number | null;
  photo_url: string | null;
}

export interface ItemVariant {
  id: string;
  item_id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
}

export interface Stock {
  id: string;
  item_id: string;
  variant_id: string | null;
  size_id: string | null;
  color_id: string | null;
  warehouse_id: string;
  quantity: number;
}

// ─── Phase 3: Billing Types ─────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';
export type PaymentMode = 'cash' | 'card' | 'upi' | 'credit';
export type DiscountType = 'flat' | 'percent';

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: 'gst' | 'non_gst';
  status: InvoiceStatus;
  customer_id: string | null;
  customer_name?: string;
  warehouse_id: string;
  invoice_date: Date;
  due_date: Date | null;
  is_scheme_invoice: boolean;
  is_recurring: boolean;
  recurring_frequency: 'weekly' | 'monthly' | null;
  next_recurring_date: Date | null;
  payment_mode: PaymentMode | null;
  amount_paid: number;
  invoice_discount_type: DiscountType | null;
  invoice_discount_value: number | null;
  invoice_discount_amount: number;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
  notes: string | null;
  created_by: string;
  created_at: Date;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_id: string;
  item_name?: string;
  variant_id: string | null;
  sort_order: number;
  quantity: number;
  rate: number;
  discount_type: DiscountType | null;
  discount_value: number | null;
  discount_amount: number;
  hsn_code: string | null;
  gst_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface Quotation {
  id: string;
  quotation_number: string;
  status: QuotationStatus;
  customer_id: string | null;
  customer_name?: string;
  warehouse_id: string;
  valid_until: Date | null;
  converted_to_invoice_id: string | null;
  is_scheme_invoice: boolean;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
  notes: string | null;
  created_by: string;
  created_at: Date;
}

export type CreditNoteStatus = 'draft' | 'issued' | 'settled';

export interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name?: string;
  status: CreditNoteStatus;
  resolution: 'refund' | 'store_credit' | null;
  reason: string | null;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
  created_by: string;
  created_at: Date;
}

export type PurchaseStatus = 'draft' | 'confirmed' | 'paid' | 'partially_paid';

export interface PurchaseInvoice {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name?: string;
  warehouse_id: string;
  supplier_invoice_number: string | null;
  purchase_date: Date;
  status: PurchaseStatus;
  include_in_gst: boolean;
  payment_mode: PaymentMode | null;
  amount_paid: number;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
  notes: string | null;
  created_by: string;
  created_at: Date;
}

export interface DebitNote {
  id: string;
  debit_note_number: string;
  purchase_invoice_id: string | null;
  supplier_id: string;
  supplier_name?: string;
  status: 'draft' | 'issued' | 'settled';
  reason: string | null;
  reduces_itc: boolean;
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  grand_total: number;
  created_by: string;
  created_at: Date;
}

export interface DiscountScheme {
  id: string;
  name: string;
  scheme_type: 'buy_x_get_y' | 'flat' | 'percent' | 'seasonal';
  is_active: boolean;
  buy_item_id: string | null;
  buy_quantity: number | null;
  get_item_id: string | null;
  get_quantity: number | null;
  discount_value: number | null;
  min_order_value: number | null;
  valid_from: Date | null;
  valid_until: Date | null;
  created_at: Date;
}

// Lightweight line item for the invoice builder (client-side state)
export interface LineItemDraft {
  key: string;            // temporary client-side key
  item_id: string;
  item_name: string;
  variant_id: string | null;   // legacy — kept for edit of old invoices
  variant_label: string | null;
  size_id: string | null;
  color_id: string | null;
  size_label: string;
  color_label: string;
  quantity: number;
  rate: number;
  discount_type: DiscountType | null;
  discount_value: number | null;
  hsn_code: string | null;
  gst_rate: number;
  stock_qty?: number | null;
}

// ─── Phase 7: Tailoring Types ──────────────────────────────────────────────

export type TailoringStage = 'placed' | 'production' | 'ready' | 'delivered';

export interface Design {
  id: string;
  name: string;
  category: string | null;
  photo_path: string | null;
  description: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface DesignMeasurementField {
  id: string;
  design_id: string;
  field_name: string;
  field_type: 'number' | 'text';
  unit: string | null;
  sort_order: number;
}

export interface MeasurementVersion {
  id: string;
  customer_id: string;
  design_id: string;
  version_number: number;
  taken_by: string | null;
  created_at: Date;
}

export interface Tailor {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface TailoringOrder {
  id: string;
  order_number: string;
  customer_id: string;
  design_id: string;
  measurement_version_id: string | null;
  color_fabric: string | null;
  price: number;
  stage: TailoringStage;
  due_date: Date | null;
  notes: string | null;
  tailor_id: string | null;
  invoice_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Action Result Types ────────────────────────────────────────────────────

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
