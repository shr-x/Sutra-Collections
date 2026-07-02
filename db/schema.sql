-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Warehouses ───────────────────────────────────────────────────────────────
-- Created before users because users.warehouse_id references this table
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
-- Idempotent column additions for existing DBs (run on every start, safe to re-run)
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
-- stock_movements: reference to source document + human-readable description
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;
-- expenses: optional notes field shown in the expense form
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;
-- Business profile extended settings
INSERT INTO settings (key, value) VALUES
  ('company_phone',     ''),
  ('company_email',     ''),
  ('company_logo_path', '')
ON CONFLICT (key) DO NOTHING;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'accountant')),
  warehouse_id      UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  access_expires_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
-- Tracks active sessions; used for audit and forced logout by admin.
-- The JWT cookie is the auth source of truth; this table is supplementary.
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at     TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),                    -- required for credit (business rule #3)
  address         TEXT NOT NULL DEFAULT '',
  gstin           VARCHAR(15),
  consent_given   BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  credit_limit    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(20) NOT NULL,
  gstin      VARCHAR(15),
  address    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Items ────────────────────────────────────────────────────────────────────
-- HSN codes are minimum 4 digits (business rule #6)
CREATE TABLE IF NOT EXISTS items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  hsn_code    VARCHAR(10),
  item_type   VARCHAR(20) NOT NULL CHECK (item_type IN ('finished', 'raw_material')),
  gst_rate    NUMERIC(5, 2) NOT NULL DEFAULT 0   CHECK (gst_rate IN (0, 5, 12, 18, 28)),
  unit        VARCHAR(20) NOT NULL DEFAULT 'pcs',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── Item Variants ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_variants (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id  UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  size     VARCHAR(50),
  color    VARCHAR(50),
  sku      VARCHAR(100) UNIQUE
);

-- ─── Stock ────────────────────────────────────────────────────────────────────
-- One row per (item, variant, warehouse) combination
CREATE TABLE IF NOT EXISTS stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  variant_id   UUID REFERENCES item_variants(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity     NUMERIC(12, 3) NOT NULL DEFAULT 0,
  UNIQUE (item_id, variant_id, warehouse_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_item ON item_variants(item_id);

-- ─── Phase 2 additions ────────────────────────────────────────────────────────

-- Low-stock alert threshold per item (set by admin)
ALTER TABLE items ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12, 3);

-- ─── Stock Movements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  variant_id      UUID REFERENCES item_variants(id) ON DELETE SET NULL,
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID REFERENCES warehouses(id),   -- only for transfer pairs
  movement_type   VARCHAR(20) NOT NULL CHECK (movement_type IN (
    'purchase', 'adjustment_in', 'sale', 'adjustment_out', 'transfer_in', 'transfer_out'
  )),
  quantity        NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  reason          TEXT,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── App Settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('purchase_orders_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ─── Purchase Orders data model (UI in Phase 3) ───────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  notes        TEXT,
  expected_at  DATE,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES items(id),
  variant_id        UUID REFERENCES item_variants(id),
  quantity_ordered  NUMERIC(12, 3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(12, 2)
);

CREATE TABLE IF NOT EXISTS goods_received_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  notes             TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2 indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

-- ─── Phase 3: Billing ─────────────────────────────────────────────────────────

-- Invoice numbering sequences (FY-based, resets each April 1)
CREATE TABLE IF NOT EXISTS invoice_sequences (
  type           VARCHAR(20) PRIMARY KEY,
  financial_year VARCHAR(10) NOT NULL,
  last_number    INT NOT NULL DEFAULT 0
);

-- Company / billing settings (added to existing settings table via INSERT)
INSERT INTO settings (key, value) VALUES
  ('company_name',      'Sutra Collections'),
  ('company_gstin',     ''),
  ('company_address',   ''),
  ('company_state',     'Karnataka'),
  ('company_state_code','29'),
  ('upi_vpa',           '')
ON CONFLICT (key) DO NOTHING;

-- ─── Sales Invoices ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number         VARCHAR(30) UNIQUE NOT NULL,
  invoice_type           VARCHAR(10)  NOT NULL DEFAULT 'gst' CHECK (invoice_type IN ('gst','non_gst')),
  status                 VARCHAR(20)  NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','issued','paid','partially_paid','overdue','cancelled')),
  customer_id            UUID REFERENCES customers(id) ON DELETE SET NULL,
  warehouse_id           UUID NOT NULL REFERENCES warehouses(id),

  invoice_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date               DATE,
  place_of_supply        VARCHAR(100),

  is_scheme_invoice      BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE → GST exclusive
  is_recurring           BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_frequency    VARCHAR(10) CHECK (recurring_frequency IN ('weekly','monthly')),
  next_recurring_date    DATE,

  payment_mode           VARCHAR(10) CHECK (payment_mode IN ('cash','card','upi','credit')),
  amount_paid            NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Invoice-level discount (applied after line subtotals)
  invoice_discount_type  VARCHAR(10)  CHECK (invoice_discount_type IN ('flat','percent')),
  invoice_discount_value NUMERIC(10,2),
  invoice_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Computed totals (denormalized for fast reads)
  subtotal               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cgst             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst             NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total            NUMERIC(12,2) NOT NULL DEFAULT 0,

  notes                  TEXT,
  created_by             UUID NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  variant_id      UUID REFERENCES item_variants(id),
  sort_order      INT NOT NULL DEFAULT 0,

  quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  rate            NUMERIC(12,2) NOT NULL,

  discount_type   VARCHAR(10) CHECK (discount_type IN ('flat','percent')),
  discount_value  NUMERIC(10,2),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  hsn_code        VARCHAR(10),
  gst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  taxable_value   NUMERIC(12,2) NOT NULL,
  cgst_amount     NUMERIC(12,2) NOT NULL,
  sgst_amount     NUMERIC(12,2) NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL
);

-- ─── Quotations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number          VARCHAR(30) UNIQUE NOT NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  warehouse_id              UUID NOT NULL REFERENCES warehouses(id),
  valid_until               DATE,
  converted_to_invoice_id   UUID REFERENCES invoices(id),
  is_scheme_invoice         BOOLEAN NOT NULL DEFAULT FALSE,
  subtotal                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cgst                NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst                NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes                     TEXT,
  created_by                UUID NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  variant_id      UUID REFERENCES item_variants(id),
  sort_order      INT NOT NULL DEFAULT 0,
  quantity        NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  rate            NUMERIC(12,2) NOT NULL,
  discount_type   VARCHAR(10),
  discount_value  NUMERIC(10,2),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  hsn_code        VARCHAR(10),
  gst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  taxable_value   NUMERIC(12,2) NOT NULL,
  cgst_amount     NUMERIC(12,2) NOT NULL,
  sgst_amount     NUMERIC(12,2) NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL
);

-- ─── Discount Schemes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_schemes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  scheme_type     VARCHAR(20) NOT NULL CHECK (scheme_type IN ('buy_x_get_y','flat','percent','seasonal')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  buy_item_id     UUID REFERENCES items(id),
  buy_quantity    NUMERIC(12,3),
  get_item_id     UUID REFERENCES items(id),
  get_quantity    NUMERIC(12,3),
  discount_value  NUMERIC(10,2),
  min_order_value NUMERIC(12,2),
  valid_from      DATE,
  valid_until     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Credit Notes (Sales Returns) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number  VARCHAR(30) UNIQUE NOT NULL,
  invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','issued','settled')),
  resolution          VARCHAR(20) CHECK (resolution IN ('refund','store_credit')),
  reason              TEXT,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cgst          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst          NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id    UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  invoice_item_id   UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  item_id           UUID NOT NULL REFERENCES items(id),
  variant_id        UUID REFERENCES item_variants(id),
  quantity          NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  rate              NUMERIC(12,2) NOT NULL,
  hsn_code          VARCHAR(10),
  gst_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_value     NUMERIC(12,2) NOT NULL,
  cgst_amount       NUMERIC(12,2) NOT NULL,
  sgst_amount       NUMERIC(12,2) NOT NULL,
  total_amount      NUMERIC(12,2) NOT NULL
);

-- ─── Purchase Invoices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number         VARCHAR(30) UNIQUE NOT NULL,
  supplier_id             UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id            UUID NOT NULL REFERENCES warehouses(id),
  supplier_invoice_number VARCHAR(100),
  purchase_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  status                  VARCHAR(20) NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','confirmed','paid','partially_paid')),
  include_in_gst          BOOLEAN NOT NULL DEFAULT TRUE,
  payment_mode            VARCHAR(10) CHECK (payment_mode IN ('cash','card','upi','credit')),
  amount_paid             NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal                NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cgst              NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst              NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes                   TEXT,
  created_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES items(id),
  variant_id          UUID REFERENCES item_variants(id),
  sort_order          INT NOT NULL DEFAULT 0,
  quantity            NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  rate                NUMERIC(12,2) NOT NULL,
  hsn_code            VARCHAR(10),
  gst_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_value       NUMERIC(12,2) NOT NULL,
  cgst_amount         NUMERIC(12,2) NOT NULL,
  sgst_amount         NUMERIC(12,2) NOT NULL,
  total_amount        NUMERIC(12,2) NOT NULL
);

-- ─── Debit Notes (Purchase Returns) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debit_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_number   VARCHAR(30) UNIQUE NOT NULL,
  purchase_invoice_id UUID REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id),
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','issued','settled')),
  reason              TEXT,
  reduces_itc         BOOLEAN NOT NULL DEFAULT TRUE,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cgst          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sgst          NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debit_note_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id            UUID NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  purchase_invoice_item_id UUID REFERENCES purchase_invoice_items(id) ON DELETE SET NULL,
  item_id                  UUID NOT NULL REFERENCES items(id),
  variant_id               UUID REFERENCES item_variants(id),
  quantity                 NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  rate                     NUMERIC(12,2) NOT NULL,
  hsn_code                 VARCHAR(10),
  gst_rate                 NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_value            NUMERIC(12,2) NOT NULL,
  cgst_amount              NUMERIC(12,2) NOT NULL,
  sgst_amount              NUMERIC(12,2) NOT NULL,
  total_amount             NUMERIC(12,2) NOT NULL
);

-- Phase 3 indexes
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);

-- ─── Phase 4: Accounting ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(10) UNIQUE NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description    TEXT NOT NULL,
  reference_type VARCHAR(30),   -- invoice | purchase | credit_note | debit_note | expense | payment | manual
  reference_id   UUID,
  is_manual      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id),
  debit_amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id      UUID NOT NULL REFERENCES expense_categories(id),
  description      TEXT,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode     VARCHAR(10) NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','bank')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 4 indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

-- Seed standard accounts (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO accounts (account_code, account_name, account_type, is_system) VALUES
  ('1001','Cash','asset',true),
  ('1002','Bank','asset',true),
  ('1100','Accounts Receivable','asset',true),
  ('1200','CGST Input Tax Credit','asset',true),
  ('1201','SGST Input Tax Credit','asset',true),
  ('1300','Inventory','asset',true),
  ('2001','Accounts Payable','liability',true),
  ('2100','CGST Payable','liability',true),
  ('2101','SGST Payable','liability',true),
  ('3001','Owner''s Equity','equity',true),
  ('3002','Retained Earnings','equity',true),
  ('4001','Sales Revenue','income',true),
  ('4002','Other Income','income',true),
  ('5001','Cost of Goods Sold','expense',true),
  ('5100','Salary Expense','expense',true),
  ('5101','Rent Expense','expense',true),
  ('5102','Utilities Expense','expense',true),
  ('5103','Miscellaneous Expense','expense',true)
ON CONFLICT (account_code) DO NOTHING;

-- Seed expense categories (idempotent — only insert if table is empty)
INSERT INTO expense_categories (name, account_id)
  SELECT cat.name, a.id
  FROM (VALUES
    ('Salaries',     '5100'),
    ('Rent',         '5101'),
    ('Utilities',    '5102'),
    ('Miscellaneous','5103')
  ) AS cat(name, code)
  JOIN accounts a ON a.account_code = cat.code
  WHERE NOT EXISTS (SELECT 1 FROM expense_categories LIMIT 1);

-- TODO Phase 7: Add tailoring_orders, measurements, measurement_versions tables

-- ─── Phase 5/6: Credit & Dues + Payments ─────────────────────────────────────

-- Store credit balance on customers (idempotent ALTER)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Store credit applied on an invoice (idempotent ALTER)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_credit_used NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Audit trail for store credit movements
CREATE TABLE IF NOT EXISTS store_credit_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount           NUMERIC(12,2) NOT NULL,     -- positive = credit added, negative = credit used
  transaction_type VARCHAR(20) NOT NULL
                   CHECK (transaction_type IN ('credit_note','applied','manual')),
  reference_id     UUID,                        -- credit_note_id or invoice_id
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WhatsApp reminder thresholds + message templates
CREATE TABLE IF NOT EXISTS reminder_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_threshold    INT NOT NULL,                -- days overdue at which to send
  tone             VARCHAR(20) NOT NULL DEFAULT 'gentle'
                   CHECK (tone IN ('gentle','firm','final')),
  message_template TEXT NOT NULL,              -- supports {{name}}, {{invoice_number}}, {{amount}}, {{days}}
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log of every reminder actually sent
CREATE TABLE IF NOT EXISTS reminder_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id           UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  setting_id           UUID REFERENCES reminder_settings(id) ON DELETE SET NULL,
  phone_number         VARCHAR(20) NOT NULL,
  message_sent         TEXT NOT NULL,
  whatsapp_message_id  VARCHAR(100),
  status               VARCHAR(20) NOT NULL DEFAULT 'sent'
                       CHECK (status IN ('sent','failed')),
  error_message        TEXT,
  sent_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 5/6 indexes
CREATE INDEX IF NOT EXISTS idx_store_credit_customer   ON store_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_customer  ON reminder_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_invoice   ON reminder_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_setting   ON reminder_logs(setting_id);

-- Seed default reminder settings (idempotent)
INSERT INTO reminder_settings (day_threshold, tone, message_template, is_active)
SELECT * FROM (VALUES
  (7,  'gentle', 'Hi {{name}}, this is a gentle reminder that invoice {{invoice_number}} of {{amount}} is overdue by {{days}} day(s). Please arrange payment at your earliest convenience. Thank you — Sutra Collections.', true),
  (30, 'firm',   'Dear {{name}}, invoice {{invoice_number}} for {{amount}} is now {{days}} days overdue. Please clear the outstanding balance immediately to avoid any inconvenience. — Sutra Collections.', true),
  (60, 'final',  'FINAL NOTICE — {{name}}: Invoice {{invoice_number}} ({{amount}}) is {{days}} days overdue. Immediate payment is required. Please contact us urgently. — Sutra Collections.', true)
) AS v(day_threshold, tone, message_template, is_active)
WHERE NOT EXISTS (SELECT 1 FROM reminder_settings LIMIT 1);

-- ─── Phase 7: Design Portal (Tailoring) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS designs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  category    VARCHAR(100),
  photo_path  TEXT,
  description TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS design_measurement_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id   UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  field_name  VARCHAR(100) NOT NULL,
  field_type  VARCHAR(20)  NOT NULL DEFAULT 'number' CHECK (field_type IN ('number','text')),
  unit        VARCHAR(20),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS measurement_versions (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  design_id      UUID    NOT NULL REFERENCES designs(id)   ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  taken_by       UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, design_id, version_number)
);

CREATE TABLE IF NOT EXISTS measurement_values (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES measurement_versions(id)        ON DELETE CASCADE,
  field_id   UUID NOT NULL REFERENCES design_measurement_fields(id)   ON DELETE CASCADE,
  value      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tailoring_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number           VARCHAR(30)   NOT NULL UNIQUE,
  customer_id            UUID          NOT NULL REFERENCES customers(id),
  design_id              UUID          NOT NULL REFERENCES designs(id),
  measurement_version_id UUID          REFERENCES measurement_versions(id) ON DELETE SET NULL,
  color_fabric           TEXT,
  price                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  stage                  VARCHAR(30)   NOT NULL DEFAULT 'placed'
                           CHECK (stage IN ('placed','production','ready','delivered')),
  due_date               DATE,
  notes                  TEXT,
  created_by             UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Sequence row so nextInvoiceNumber('TO') works on a fresh DB
INSERT INTO invoice_sequences (type, financial_year, last_number)
VALUES ('TO', '2026-27', 0)
ON CONFLICT (type) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_customer ON tailoring_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_stage    ON tailoring_orders(stage);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_created  ON tailoring_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mver_customer             ON measurement_versions(customer_id);
CREATE INDEX IF NOT EXISTS idx_mver_design               ON measurement_versions(design_id);
CREATE INDEX IF NOT EXISTS idx_mval_version              ON measurement_values(version_id);
CREATE INDEX IF NOT EXISTS idx_design_fields_design      ON design_measurement_fields(design_id, sort_order);

-- ─── Missing columns / tables added to live DB but not schema (idempotent) ────

-- Item categorisation and extended attributes
CREATE TABLE IF NOT EXISTS item_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_sizes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  size_name  VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_colors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  color_name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS sale_price  NUMERIC(12,2);
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_url   TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES item_categories(id) ON DELETE SET NULL;

-- Stock: size/color columns for items that use the new picker (no item_variants row)
ALTER TABLE stock ADD COLUMN IF NOT EXISTS size_id  UUID REFERENCES item_sizes(id)  ON DELETE SET NULL;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES item_colors(id) ON DELETE SET NULL;

-- Unique index that enables ON CONFLICT upsert for size+color stock rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_size_color
  ON stock (item_id, warehouse_id, size_id, color_id)
  WHERE size_id IS NOT NULL AND color_id IS NOT NULL;

-- ─── One-time stock dedup (idempotent) ────────────────────────────────────────
-- A historic COALESCE-asymmetry bug caused stock UPDATEs to match 0 rows for
-- NULL-variant sales/purchases, so new duplicate rows kept getting INSERTed for
-- the same (item, warehouse, size, color). Collapse duplicates into one row by
-- summing quantities (NULLs grouped as equal). No-op once already deduped.
-- (uuid has no MIN() aggregate in Postgres, so cast to text and back.)
UPDATE stock s SET quantity = agg.total
FROM (
  SELECT item_id, warehouse_id, size_id, color_id, SUM(quantity) AS total, MIN(id::text)::uuid AS keep_id
  FROM stock
  GROUP BY item_id, warehouse_id, size_id, color_id
  HAVING COUNT(*) > 1
) agg
WHERE s.id = agg.keep_id;

DELETE FROM stock s USING (
  SELECT item_id, warehouse_id, size_id, color_id, MIN(id::text)::uuid AS keep_id
  FROM stock
  GROUP BY item_id, warehouse_id, size_id, color_id
  HAVING COUNT(*) > 1
) agg
WHERE s.item_id = agg.item_id AND s.warehouse_id = agg.warehouse_id
  AND s.size_id  IS NOT DISTINCT FROM agg.size_id
  AND s.color_id IS NOT DISTINCT FROM agg.color_id
  AND s.id <> agg.keep_id;

-- Invoice items: carry size/color through from the invoice builder
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS size_id  UUID REFERENCES item_sizes(id)  ON DELETE SET NULL;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES item_colors(id) ON DELETE SET NULL;

-- Purchase invoice items: carry size/color through from the purchase form
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS size_id  UUID REFERENCES item_sizes(id)  ON DELETE SET NULL;
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES item_colors(id) ON DELETE SET NULL;

-- Loyalty programme
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points         INT  NOT NULL,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('earned','redeemed','expired','manual')),
  reference_id   UUID,
  reference_type VARCHAR(30),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points_balance  INT NOT NULL DEFAULT 0;

-- ─── DPDP consent (given/revoked) + per-customer revoke token ─────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dpdp_consent  VARCHAR(10) NOT NULL DEFAULT 'given';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_dpdp_consent_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_dpdp_consent_check CHECK (dpdp_consent IN ('given','revoked'));
  END IF;
END $$;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_token UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INT NOT NULL DEFAULT 0;
-- Buy-X-Get-Y / scheme discount tracked separately from invoice_discount_amount
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS scheme_discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Last date a WhatsApp payment reminder was sent for this invoice (dedup, #4)
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS last_reminder_sent      DATE;

-- WhatsApp payment-reminder cadence
INSERT INTO settings (key, value) VALUES
  ('reminder_days_before',      '3'),
  ('overdue_reminder_interval', '1')
ON CONFLICT (key) DO NOTHING;
-- Loyalty points redeemed expressed in rupees (1 pt = ₹1), for PDF display
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

INSERT INTO settings (key, value) VALUES
  ('loyalty_earn_rate',       '1'),
  ('loyalty_redemption_rate', '1')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_item_sizes_item  ON item_sizes(item_id);
CREATE INDEX IF NOT EXISTS idx_item_colors_item ON item_colors(item_id);

-- Allow 'loyalty_points' as a valid credit note resolution
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint
  WHERE conrelid = 'credit_notes'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%resolution%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE credit_notes DROP CONSTRAINT %I', con_name);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'credit_notes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%loyalty_points%'
  ) THEN
    ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_resolution_check
      CHECK (resolution IN ('refund', 'store_credit', 'loyalty_points'));
  END IF;
END $$;

-- Refunds now auto-settle on creation (stock returned + money/points given at
-- once). Backfill any legacy 'issued' credit notes to 'settled' so the billing
-- dashboard's "awaiting settlement" banner reflects reality. (#3)
UPDATE credit_notes SET status = 'settled' WHERE status = 'issued';

-- Loyalty redemption is a fixed 1 point = ₹1; correct any legacy misconfiguration.
UPDATE settings SET value = '1' WHERE key = 'loyalty_redemption_rate';

-- ─── Tailoring Overhaul ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tailors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(20),
  specialty  VARCHAR(255),
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS tailor_id  UUID REFERENCES tailors(id)   ON DELETE SET NULL;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id)  ON DELETE SET NULL;

-- Fabric options managed dropdown (combobox in tailoring order form)
CREATE TABLE IF NOT EXISTS fabric_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO fabric_options (name) VALUES
  ('Cotton'),('Silk'),('Polyester'),('Linen'),('Wool'),
  ('Chiffon'),('Georgette'),('Velvet'),('Raw Silk'),('Net')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tailors_active         ON tailors(is_active);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_tailor  ON tailoring_orders(tailor_id);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_invoice ON tailoring_orders(invoice_id);

-- Batch booking support
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS batch_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_batch_id ON tailoring_orders(batch_id) WHERE batch_id IS NOT NULL;

-- ─── Idempotent column additions (Phase 10+11 & CRM) ─────────────────────────
-- Users: staff module columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active   BOOLEAN       NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ─── Super Admin Console ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS super_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sa_update_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running', -- running | success | failed | rolled_back
  git_before   TEXT,
  git_after    TEXT,
  backup_path  TEXT,
  error_msg    TEXT
);

CREATE TABLE IF NOT EXISTS sa_stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  quantity     INTEGER NOT NULL, -- positive = add, negative = remove
  reason       TEXT,
  adjusted_by  TEXT NOT NULL,   -- super_admin username
  adjusted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers: CRM / birthday-anniversary / soft-delete
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth    DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS anniversary_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;

-- Invoice customer snapshots (captured at creation, survives customer edits)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_snapshot  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_gstin_snapshot TEXT;

-- Tailoring order customer snapshots
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot  TEXT;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;

-- Items: low-stock alert dedup (prevents repeat alerts within 24h)
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_low_stock_alert TIMESTAMPTZ;

-- Settings: shop anniversary date for daily WA greeting cron
INSERT INTO settings (key, value) VALUES ('shop_anniversary_date', '') ON CONFLICT (key) DO NOTHING;

-- ─── Audit Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(30) NOT NULL,
  entity_type  VARCHAR(50) NOT NULL,
  entity_id    UUID        NOT NULL,
  entity_label TEXT,
  old_value    TEXT,
  new_value    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON audit_log(user_id);

-- ─── Attendance ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  status     VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','half_day','leave')),
  marked_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- ─── Payroll Runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month            INT           NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             INT           NOT NULL,
  base_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_present     NUMERIC(5,1)  NOT NULL DEFAULT 0,
  half_days        NUMERIC(5,1)  NOT NULL DEFAULT 0,
  total_days       INT           NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_entry_id UUID          REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_user  ON payroll_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs(year, month);

-- WhatsApp: incoming message log (webhook receiver)
CREATE TABLE IF NOT EXISTS whatsapp_incoming_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone          TEXT NOT NULL,
  message_type        TEXT NOT NULL DEFAULT 'text',
  message_text        TEXT,
  whatsapp_message_id TEXT UNIQUE,
  customer_id         UUID REFERENCES customers(id),
  raw_payload         JSONB NOT NULL DEFAULT '{}',
  processed           BOOLEAN NOT NULL DEFAULT FALSE,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_phone ON whatsapp_incoming_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_received ON whatsapp_incoming_messages(received_at DESC);
