export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  navigateTo?: string;
  action?: string;
  showFinishButton?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  // ── SECTION 1: DASHBOARD ──────────────────────────────────────────────────
  {
    navigateTo: '/dashboard',
    target: '[data-tour="dashboard-stats"]',
    title: 'Welcome to Sutra Collections! 🎉',
    description: 'This is your Dashboard — your command center. At a glance you can see today\'s sales, outstanding dues, pending tailoring orders, and low stock alerts. Everything important is right here.',
    position: 'bottom',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    description: 'The sidebar gives you access to every part of the app — Billing, Customers, Suppliers, Inventory, Accounting, Tailoring, and Reports. On mobile, tap the ☰ menu icon to open it.',
    position: 'right',
  },
  {
    target: '[data-tour="global-search"]',
    title: 'Global Search',
    description: 'Use the search bar at the top to instantly find any customer, invoice, or item by name or number. No need to navigate — just type and go.',
    position: 'bottom',
  },

  // ── SECTION 2: CUSTOMERS ──────────────────────────────────────────────────
  {
    navigateTo: '/customers',
    target: 'a[href="/customers/new"]',
    title: 'Adding Customers',
    description: 'Before billing, add your customers here. Click "+ New Customer" to add their name, phone number, address, GSTIN (if applicable), and credit limit.',
    position: 'left',
    action: 'You can try clicking this to see the form',
  },
  {
    target: 'table',
    title: 'Customer List',
    description: 'All your customers appear here. Click any customer to view their full profile, invoice history, outstanding balance, loyalty points, and measurements.',
    position: 'top',
  },
  {
    target: 'input[type="text"], input[placeholder]',
    title: 'Search Customers',
    description: 'Search by name or phone number to quickly find a customer. The list updates instantly as you type.',
    position: 'bottom',
  },
  {
    navigateTo: '/customers/dues',
    target: '.grid, main',
    title: 'Outstanding Dues',
    description: 'Track which customers owe you money. This page shows total outstanding, aged by 60-90 days and 90+ days critical. Use this to follow up on overdue payments.',
    position: 'bottom',
  },

  // ── SECTION 3: SUPPLIERS ─────────────────────────────────────────────────
  {
    navigateTo: '/suppliers',
    target: 'a[href="/suppliers/new"]',
    title: 'Managing Suppliers',
    description: 'Add your fabric suppliers, wholesalers, and vendors here. Each supplier can have their GSTIN, phone, and address stored for purchase invoices and debit notes.',
    position: 'left',
  },
  {
    target: 'table',
    title: 'Supplier List',
    description: 'Click any supplier to see all purchase invoices raised against them and your total payables.',
    position: 'top',
  },

  // ── SECTION 4: INVENTORY ─────────────────────────────────────────────────
  {
    navigateTo: '/inventory/items',
    target: 'a[href="/inventory/items/new"]',
    title: 'Adding Products / Items',
    description: 'Add every product you sell or raw material you use here. Each item has a name, HSN code, GST rate, category (Finished Good or Raw Material), and unit of measurement.',
    position: 'left',
    action: 'Click "+ New Item" to see the item creation form',
  },
  {
    target: '.flex.flex-wrap, .flex.gap-2',
    title: 'Item Categories',
    description: 'Filter your items by type — Finished Goods are what you sell to customers (sarees, kurtas, blouses), Raw Materials are what you buy from suppliers (fabric, thread, lace).',
    position: 'bottom',
  },
  {
    target: 'tbody tr:first-child td:first-child, tbody tr',
    title: 'Item Detail & Variants',
    description: 'Click any item to manage its sizes, colors, and current stock levels. For finished goods you can add size variants (S, M, L, XL) and color variants (Red, Blue, etc.) — each tracked separately.',
    position: 'right',
  },
  {
    navigateTo: '/inventory/stock',
    target: 'table',
    title: 'Stock Levels',
    description: 'This page shows your current stock for every item and variant across all warehouses. Stock goes up when you create a Purchase Invoice and down when you create a Sales Invoice.',
    position: 'top',
  },
  {
    navigateTo: '/settings/warehouses',
    target: 'main',
    title: 'Warehouses / Store Locations',
    description: 'If you have multiple store locations or godowns, manage them here. Stock is tracked per warehouse. The Main Store is your default.',
    position: 'bottom',
  },

  // ── SECTION 5: BILLING — SALES ───────────────────────────────────────────
  {
    navigateTo: '/billing/invoices',
    target: 'a[href="/billing/invoices/new"]',
    title: 'Creating a Sales Invoice',
    description: 'This is where you bill your customers. Click "+ New Invoice" to start — you can select a customer, add items, apply discounts, and choose Cash, UPI, or Credit payment.',
    position: 'left',
    action: 'This is the most-used feature — let\'s walk through it',
  },
  {
    navigateTo: '/billing/invoices/new',
    target: 'input[placeholder]',
    title: 'Step 1: Select Customer',
    description: 'Search for an existing customer by name or phone, or leave it blank for a walk-in customer. If the customer has loyalty points, they\'ll appear here and can be redeemed.',
    position: 'bottom',
  },
  {
    target: '.btn-primary, button[type="button"]',
    title: 'Step 2: Add Items',
    description: 'Click "+ Select Item" to pick products from your inventory. Select the size and color variant, quantity, and the rate auto-fills from the item price. GST is calculated automatically.',
    position: 'top',
  },
  {
    target: 'select[name="payment_mode"], [class*="payment"], .flex.gap-2',
    title: 'Step 3: Choose Payment Method',
    description: 'Select Cash or UPI for immediate payment — the invoice is marked Paid instantly. Select Credit to record the sale but mark it as unpaid — the balance appears in Outstanding Dues.',
    position: 'top',
  },
  {
    target: 'input[type="checkbox"], label',
    title: 'GST vs Non-GST Invoices',
    description: 'Toggle between GST (tax invoice with CGST+SGST breakdown) and Non-GST (simple invoice without tax breakdown) depending on whether the customer needs a proper tax invoice.',
    position: 'bottom',
  },

  // ── SECTION 6: BILLING — PURCHASES ───────────────────────────────────────
  {
    navigateTo: '/billing/purchases',
    target: 'a[href="/billing/purchases/new"]',
    title: 'Purchase Invoices (Receiving Stock)',
    description: 'When you buy fabric or goods from a supplier, create a Purchase Invoice here. This automatically increases your stock levels for those items and records the payable amount against the supplier.',
    position: 'left',
  },
  {
    target: 'table',
    title: 'Purchase History',
    description: 'All your purchases are listed here with supplier name, date, total amount, and ITC (Input Tax Credit) claimable status. ITC claimable purchases reduce your GST liability.',
    position: 'top',
  },

  // ── SECTION 7: REFUNDS & DEBIT NOTES ─────────────────────────────────────
  {
    navigateTo: '/billing/credit-notes',
    target: '.btn-primary, a.btn-primary',
    title: 'Refunds (Credit Notes)',
    description: 'When a customer returns goods or you need to reverse a sale, create a Credit Note here. It reverses the accounting entries and can credit loyalty points back to the customer.',
    position: 'left',
  },
  {
    navigateTo: '/billing/debit-notes',
    target: '.btn-primary, a.btn-primary',
    title: 'Debit Notes (Supplier Returns)',
    description: 'When you return goods to a supplier or they overcharge you, create a Debit Note. It reduces your payable balance against that supplier.',
    position: 'left',
  },

  // ── SECTION 8: TAILORING ─────────────────────────────────────────────────
  {
    navigateTo: '/tailoring',
    target: 'a[href="/tailoring/new"]',
    title: 'Creating a Tailoring Order',
    description: 'Click "+ New Order" to start a tailoring order. You\'ll select the design, customer, take measurements, and specify fabric/color and price. Each order gets a unique order number and is tracked through production stages.',
    position: 'left',
  },
  {
    target: '.flex.flex-wrap.gap, .rounded-full',
    title: 'Order Stages',
    description: 'Track every order through its lifecycle: Order Placed → In Production → Ready for Pickup → Delivered. Filter by stage to see what needs attention today.',
    position: 'bottom',
  },
  {
    navigateTo: '/tailoring/production',
    target: '.grid',
    title: 'Production Board',
    description: 'The Production Board gives you a Kanban-style view of all active orders by stage. Move orders between stages as work progresses. WhatsApp notifications go to customers automatically when their order is Ready for Pickup.',
    position: 'right',
  },
  {
    navigateTo: '/designs',
    target: '.grid, main',
    title: 'Design Catalog',
    description: 'Store all your design templates here with photos and measurement fields. When creating a tailoring order, you pick a design and it auto-loads the right measurement fields (chest, waist, length, etc.).',
    position: 'bottom',
  },
  {
    navigateTo: '/tailoring/tailors',
    target: 'table, .card',
    title: 'Managing Tailors',
    description: 'Add your tailors here with their name, phone, and specialty. When moving an order to "In Production", you assign it to a tailor — they get a WhatsApp notification with the order details PDF.',
    position: 'bottom',
  },

  // ── SECTION 9: ACCOUNTING ─────────────────────────────────────────────────
  {
    navigateTo: '/accounting',
    target: '.grid, main',
    title: 'Accounting Overview',
    description: 'Your complete financial picture — Cash on Hand, Bank Balance, Accounts Receivable, Accounts Payable, Total Revenue, Total Expenses, and Net Profit. All calculated automatically from your invoices and expenses.',
    position: 'bottom',
  },
  {
    navigateTo: '/accounting/journal',
    target: 'table',
    title: 'Journal / Ledger',
    description: 'Every transaction in the app — sales, purchases, payments, refunds — automatically creates a double-entry journal entry here. Export as PDF or JSON for your accountant.',
    position: 'top',
  },
  {
    navigateTo: '/accounting/gst/gstr1',
    target: 'table',
    title: 'GSTR-1 — Sales Register',
    description: 'Your monthly GST sales register, auto-populated from all your sales invoices. Export as PDF, CSV, or JSON to file with your CA or upload to the GST portal.',
    position: 'top',
  },
  {
    navigateTo: '/accounting/gst/gstr3b',
    target: '.space-y-6, main',
    title: 'GSTR-3B — Tax Summary',
    description: 'Your monthly tax liability summary — outward supplies, input tax credit from purchases, and net tax payable. Export and share with your CA for filing.',
    position: 'top',
  },
  {
    navigateTo: '/accounting/expenses',
    target: '.btn-primary, a[href*="new"]',
    title: 'Recording Expenses',
    description: 'Record non-purchase business expenses here — rent, electricity, salaries, etc. These flow into your P&L statement and reduce your net profit correctly.',
    position: 'bottom',
  },

  // ── SECTION 10: REPORTS ───────────────────────────────────────────────────
  {
    navigateTo: '/reports/daybook',
    target: '.grid, main',
    title: 'Daybook',
    description: 'The Daybook shows everything that happened on a single day — all sales, purchases, and expenses with a running total. Great for daily reconciliation and end-of-day cash counting.',
    position: 'bottom',
  },
  {
    navigateTo: '/reports/sales',
    target: '.grid, main',
    title: 'Sales Report',
    description: 'Analyze your sales over any date range — total revenue, GST collected, daily trend chart, and a breakdown by item. Export as CSV or PDF to track business growth.',
    position: 'bottom',
  },
  {
    navigateTo: '/reports/best-sellers',
    target: 'table',
    title: 'Best Sellers',
    description: 'See which items sell the most by quantity or revenue. Use this to decide what to stock more of and what\'s not moving.',
    position: 'top',
  },
  {
    navigateTo: '/reports/export',
    target: '.grid, main',
    title: 'Data Export',
    description: 'Export any dataset — customers, suppliers, items, invoices, purchases, tailoring orders — as CSV, JSON, or PDF. Useful for backups, sharing with your accountant, or importing into other tools.',
    position: 'top',
  },

  // ── SECTION 11: SETTINGS ─────────────────────────────────────────────────
  {
    navigateTo: '/settings',
    target: '[data-tour="settings-store"]',
    title: 'Store Settings',
    description: 'Set up your store name, GSTIN, address, phone, UPI VPA (for QR codes on invoices), and logo. This information appears on every invoice and receipt you generate.',
    position: 'bottom',
  },
  {
    target: '[data-tour="settings-whatsapp"]',
    title: 'WhatsApp Notifications',
    description: 'Configure your admin WhatsApp number for low stock alerts, set how many days before due date payment reminders go out, and manage all automated customer notifications — powered by WhatsApp Business API.',
    position: 'top',
  },
  {
    target: '[data-tour="settings-modules"]',
    title: 'Feature Modules',
    description: 'Enable or disable optional modules. Turn on the Staff module to track attendance and performance. Enable PO Flow for a full Purchase Order → Goods Received Note → Invoice workflow instead of direct purchase invoices.',
    position: 'top',
  },
  {
    navigateTo: '/settings/schemes',
    target: 'table, main',
    title: 'Discount Schemes',
    description: 'Create automatic discount schemes — Buy X Get Y free, flat discounts, or percentage off. Once active, they apply automatically when billing customers who meet the conditions. Set validity dates to run time-limited offers.',
    position: 'bottom',
  },

  // ── SECTION 12: COMPLETION ────────────────────────────────────────────────
  {
    navigateTo: '/dashboard',
    target: '[data-tour="dashboard-stats"]',
    title: "You're all set! 🎊",
    description: "That's the full tour of Sutra Collections! You now know how to manage customers, create invoices, track tailoring orders, handle accounting, and run reports. Click 'Finish Tour' to start using the app, or restart anytime from Settings → Help & Onboarding.",
    position: 'bottom',
    showFinishButton: true,
  },
];
