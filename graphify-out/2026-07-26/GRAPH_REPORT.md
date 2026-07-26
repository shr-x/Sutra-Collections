# Graph Report - .  (2026-06-25)

## Corpus Check
- 232 files · ~102,402 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1006 nodes · 2408 edges · 77 communities (62 shown, 15 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 131 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_PDF Rendering & Document Export|PDF Rendering & Document Export]]
- [[_COMMUNITY_Invoice & Search API Routes|Invoice & Search API Routes]]
- [[_COMMUNITY_Package Dependencies & Config|Package Dependencies & Config]]
- [[_COMMUNITY_Billing Import & Debit Note Forms|Billing Import & Debit Note Forms]]
- [[_COMMUNITY_Warehouse Settings Management|Warehouse Settings Management]]
- [[_COMMUNITY_Tailoring Order Flow|Tailoring Order Flow]]
- [[_COMMUNITY_Purchase Listing & Search UI|Purchase Listing & Search UI]]
- [[_COMMUNITY_CRM, Designs & Reminders|CRM, Designs & Reminders]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_AI Import Wizards|AI Import Wizards]]
- [[_COMMUNITY_Invoice Builder & Tailoring UI|Invoice Builder & Tailoring UI]]
- [[_COMMUNITY_Customer Detail & Edit Pages|Customer Detail & Edit Pages]]
- [[_COMMUNITY_Expense Tracking & Forms|Expense Tracking & Forms]]
- [[_COMMUNITY_Design Portal Actions|Design Portal Actions]]
- [[_COMMUNITY_Shared Types & Interfaces|Shared Types & Interfaces]]
- [[_COMMUNITY_Inventory & Supplier Import API|Inventory & Supplier Import API]]
- [[_COMMUNITY_Inventory Item Management|Inventory Item Management]]
- [[_COMMUNITY_Reports & Dashboard Pages|Reports & Dashboard Pages]]
- [[_COMMUNITY_TypeScript & Next.js Config|TypeScript & Next.js Config]]
- [[_COMMUNITY_WhatsApp Reminders UI|WhatsApp Reminders UI]]
- [[_COMMUNITY_Supplier Management Pages|Supplier Management Pages]]
- [[_COMMUNITY_Module Group 21|Module Group 21]]
- [[_COMMUNITY_Module Group 22|Module Group 22]]
- [[_COMMUNITY_Module Group 23|Module Group 23]]
- [[_COMMUNITY_Module Group 24|Module Group 24]]
- [[_COMMUNITY_Module Group 25|Module Group 25]]
- [[_COMMUNITY_Module Group 26|Module Group 26]]
- [[_COMMUNITY_Module Group 27|Module Group 27]]
- [[_COMMUNITY_Module Group 28|Module Group 28]]
- [[_COMMUNITY_Module Group 29|Module Group 29]]
- [[_COMMUNITY_Module Group 30|Module Group 30]]
- [[_COMMUNITY_Module Group 31|Module Group 31]]
- [[_COMMUNITY_Module Group 32|Module Group 32]]
- [[_COMMUNITY_Module Group 33|Module Group 33]]
- [[_COMMUNITY_Module Group 34|Module Group 34]]
- [[_COMMUNITY_Module Group 35|Module Group 35]]
- [[_COMMUNITY_Module Group 36|Module Group 36]]
- [[_COMMUNITY_Module Group 37|Module Group 37]]
- [[_COMMUNITY_Module Group 38|Module Group 38]]
- [[_COMMUNITY_Module Group 39|Module Group 39]]
- [[_COMMUNITY_Module Group 40|Module Group 40]]
- [[_COMMUNITY_Module Group 41|Module Group 41]]
- [[_COMMUNITY_Module Group 42|Module Group 42]]
- [[_COMMUNITY_Module Group 43|Module Group 43]]
- [[_COMMUNITY_Module Group 44|Module Group 44]]
- [[_COMMUNITY_Module Group 45|Module Group 45]]
- [[_COMMUNITY_Module Group 46|Module Group 46]]
- [[_COMMUNITY_Module Group 47|Module Group 47]]
- [[_COMMUNITY_Module Group 48|Module Group 48]]
- [[_COMMUNITY_Module Group 49|Module Group 49]]
- [[_COMMUNITY_Module Group 50|Module Group 50]]
- [[_COMMUNITY_Module Group 51|Module Group 51]]
- [[_COMMUNITY_Module Group 52|Module Group 52]]
- [[_COMMUNITY_Module Group 53|Module Group 53]]
- [[_COMMUNITY_Module Group 54|Module Group 54]]
- [[_COMMUNITY_Module Group 55|Module Group 55]]
- [[_COMMUNITY_Module Group 56|Module Group 56]]
- [[_COMMUNITY_Module Group 57|Module Group 57]]
- [[_COMMUNITY_Module Group 58|Module Group 58]]
- [[_COMMUNITY_Module Group 59|Module Group 59]]
- [[_COMMUNITY_Module Group 60|Module Group 60]]
- [[_COMMUNITY_Module Group 61|Module Group 61]]
- [[_COMMUNITY_Module Group 62|Module Group 62]]
- [[_COMMUNITY_Module Group 63|Module Group 63]]
- [[_COMMUNITY_Module Group 64|Module Group 64]]
- [[_COMMUNITY_Module Group 65|Module Group 65]]
- [[_COMMUNITY_Module Group 66|Module Group 66]]
- [[_COMMUNITY_Module Group 67|Module Group 67]]
- [[_COMMUNITY_Module Group 68|Module Group 68]]
- [[_COMMUNITY_Module Group 71|Module Group 71]]
- [[_COMMUNITY_Module Group 72|Module Group 72]]
- [[_COMMUNITY_Module Group 73|Module Group 73]]
- [[_COMMUNITY_Module Group 74|Module Group 74]]
- [[_COMMUNITY_Module Group 75|Module Group 75]]

## God Nodes (most connected - your core abstractions)
1. `requireRole()` - 283 edges
2. `query()` - 209 edges
3. `formatInr()` - 67 edges
4. `getSession()` - 50 edges
5. `pool` - 46 edges
6. `ActionResult` - 26 edges
7. `calcInvoiceTotals()` - 21 edges
8. `verifySession()` - 21 edges
9. `Sutra Collections ERP System` - 17 edges
10. `nextInvoiceNumber()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Sutra Collections Brand Logo` --conceptually_related_to--> `Sutra Collections ERP System`  [INFERRED]
  uploads/logo.jpg → CLAUDE.md
- `NewExpensePage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/accounting/expenses/new/page.tsx → lib/auth.ts
- `JournalEntryDetailPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/accounting/journal/[id]/page.tsx → lib/auth.ts
- `NewJournalEntryPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/accounting/journal/new/page.tsx → lib/auth.ts
- `BillingImportPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/billing/import/page.tsx → lib/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phase 8 CRM & Reporting Feature Set** — memory_project_phase8_loyalty_points, memory_project_phase8_greetings_cron, memory_project_phase8_customer_insights, memory_project_phase8_audit_log, memory_project_phase8_reports, memory_project_phase8_csv_export [EXTRACTED 1.00]
- **ERP Role-Based Access Control (Admin, Accountant, Staff)** — claude_md_role_admin, claude_md_role_accountant, claude_md_role_staff, claude_md_iron_session [EXTRACTED 1.00]
- **Docker Services with Health-Checked DB Dependency** — docker_compose_db_service, docker_compose_app_service, docker_compose_backup_service [EXTRACTED 1.00]

## Communities (77 total, 15 thin omitted)

### Community 0 - "PDF Rendering & Document Export"
Cohesion: 0.06
Nodes (46): GET(), GET(), GET(), GET(), GET(), ACCOUNTING_CHILDREN, BILLING_CHILDREN, CUSTOMERS_CHILDREN (+38 more)

### Community 1 - "Invoice & Search API Routes"
Cohesion: 0.10
Nodes (22): GET(), GET(), GET(), DELETE(), DELETE(), GET(), RootPage(), DELETE() (+14 more)

### Community 2 - "Package Dependencies & Config"
Cohesion: 0.05
Nodes (38): dependencies, bcryptjs, jose, next, node-cron, pg, qrcode, react (+30 more)

### Community 3 - "Billing Import & Debit Note Forms"
Cohesion: 0.08
Nodes (28): POST(), metadata, metadata, metadata, STATUS_BADGE, metadata, createDebitNoteAction(), DebitNoteSchema (+20 more)

### Community 4 - "Warehouse Settings Management"
Cohesion: 0.08
Nodes (25): metadata, metadata, EditWarehousePage(), NewWarehousePage(), ALL_TYPES, createStockMovementAction(), IN_TYPES, MovementSchema (+17 more)

### Community 5 - "Tailoring Order Flow"
Cohesion: 0.07
Nodes (29): metadata, NEXT_LABEL, NEXT_STAGE, STAGE_BADGE, STAGE_LABEL, TailoringOrderDetailPage(), CustomerOption, DesignOption (+21 more)

### Community 6 - "Purchase Listing & Search UI"
Cohesion: 0.08
Nodes (23): metadata, Props, SearchInput(), BADGE, CreditNotesPage(), metadata, DebitNotesPage(), metadata (+15 more)

### Community 7 - "CRM, Designs & Reminders"
Cohesion: 0.09
Nodes (20): POST(), metadata, metadata, metadata, metadata, AttendanceStatus, DELETE(), POST() (+12 more)

### Community 8 - "Project Documentation"
Cohesion: 0.11
Nodes (28): Build Phases (Foundation through Polish), Cloudflare Tunnel (shr-x.in), Docker Compose Containerization, Sutra Collections ERP System, Gemini API (AI Import), GST Tax-Inclusive Pricing Rule, GST Setup (Regular, Monthly GSTR-1+3B, CGST+SGST), Iron-Session Auth (+20 more)

### Community 9 - "AI Import Wizards"
Cohesion: 0.11
Nodes (18): metadata, metadata, metadata, ImportColumn, ImportWizard(), Props, SaveResult, Step (+10 more)

### Community 10 - "Invoice Builder & Tailoring UI"
Cohesion: 0.12
Nodes (17): metadata, metadata, metadata, BestSellersPage(), metadata, EditDesignPage(), GET(), POST() (+9 more)

### Community 11 - "Customer Detail & Edit Pages"
Cohesion: 0.13
Nodes (17): metadata, metadata, metadata, createCustomerAction(), CustomerSchema, CustomerState, deleteCustomerAction(), parseCustomerForm() (+9 more)

### Community 12 - "Expense Tracking & Forms"
Cohesion: 0.11
Nodes (16): createExpenseAction(), ExpenseSchema, Category, INIT, postExpense(), runPayrollAction(), RunPayrollInput, updateBaseSalaryAction() (+8 more)

### Community 13 - "Design Portal Actions"
Cohesion: 0.13
Nodes (12): metadata, addFieldAction(), createDesignAction(), deleteDesignAction(), deleteFieldAction(), DesignSchema, DesignState, FieldSchema (+4 more)

### Community 14 - "Shared Types & Interfaces"
Cohesion: 0.09
Nodes (22): CreditNote, CreditNoteStatus, DebitNote, Design, DesignMeasurementField, DiscountScheme, Invoice, InvoiceItem (+14 more)

### Community 15 - "Inventory & Supplier Import API"
Cohesion: 0.09
Nodes (13): POST(), POST(), metadata, metadata, metadata, JournalEntryDetailPage(), JournalEntryRow, JournalLineRow (+5 more)

### Community 16 - "Inventory Item Management"
Cohesion: 0.16
Nodes (14): metadata, metadata, EditItemPage(), createItemAction(), ItemSchema, ItemState, parseItem(), resolveItemType() (+6 more)

### Community 17 - "Reports & Dashboard Pages"
Cohesion: 0.13
Nodes (17): metadata, BillingPage(), metadata, DashboardPage(), metadata, DaybookPage(), DaybookRow, metadata (+9 more)

### Community 18 - "TypeScript & Next.js Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 19 - "WhatsApp Reminders UI"
Cohesion: 0.12
Nodes (11): INIT, Props, Setting, Props, INIT, Props, VARIABLES, ItemOpt (+3 more)

### Community 20 - "Supplier Management Pages"
Cohesion: 0.18
Nodes (12): metadata, metadata, EditSupplierPage(), NewSupplierPage(), createSupplierAction(), deleteSupplierAction(), parse(), SupplierSchema (+4 more)

### Community 21 - "Module Group 21"
Cohesion: 0.25
Nodes (12): POST(), POST(), POST(), POST(), BlobPart, callGeminiJson(), EXCEL_MIME, excelToText() (+4 more)

### Community 22 - "Module Group 22"
Cohesion: 0.17
Nodes (11): AccountingPage(), metadata, BalanceSheetPage(), metadata, getAccountBalances(), currentFyRange(), metadata, ProfitLossPage() (+3 more)

### Community 23 - "Module Group 23"
Cohesion: 0.15
Nodes (9): POST(), metadata, csv(), GET(), EditInvoicePage(), updateInvoiceAction(), SupplierSchema, csv() (+1 more)

### Community 24 - "Module Group 24"
Cohesion: 0.17
Nodes (11): metadata, metadata, EditUserPage(), NewUserPage(), createUserAction(), FormState, NewUserSchema, updateUserAction() (+3 more)

### Community 25 - "Module Group 25"
Cohesion: 0.24
Nodes (12): createInvoiceAction(), InvoiceSchema, LineItemSchema, recordPaymentAction(), postSalesInvoice(), AuditAction, AuditEntity, logAudit() (+4 more)

### Community 26 - "Module Group 26"
Cohesion: 0.18
Nodes (11): metadata, ConfirmForm(), EditReminderPage(), deleteReminderAction(), ReminderSchema, toggleReminderAction(), updateReminderAction(), metadata (+3 more)

### Community 27 - "Module Group 27"
Cohesion: 0.18
Nodes (10): metadata, metadata, EditSchemePage(), NewSchemePage(), createSchemeAction(), SchemeSchema, toggleSchemeAction(), updateSchemeAction() (+2 more)

### Community 28 - "Module Group 28"
Cohesion: 0.17
Nodes (10): metadata, metadata, DebitNoteDetailPage(), calcLine(), InvoiceDiscountInput, InvoiceTotals, LineCalc, LineResult (+2 more)

### Community 29 - "Module Group 29"
Cohesion: 0.18
Nodes (9): AttendanceStatus, DAY_NAMES, DayEntry, Props, StaffUser, STATUS_CONFIG, AttendancePage(), daysInMonth() (+1 more)

### Community 30 - "Module Group 30"
Cohesion: 0.20
Nodes (7): BusinessFormState, saveBusinessSettingsAction(), INITIAL, Props, BusinessProfilePage(), metadata, SETTING_KEYS

### Community 31 - "Module Group 31"
Cohesion: 0.20
Nodes (8): ConfirmDialog(), ConfirmDialogProps, Props, Color, Size, SizeColorManagerProps, StockCell, Warehouse

### Community 32 - "Module Group 32"
Cohesion: 0.17
Nodes (6): COLOR_HEX, ItemPickerModalProps, PickerAddEvent, PickerColor, PickerItem, PickerSize

### Community 33 - "Module Group 33"
Cohesion: 0.32
Nodes (9): GET(), GreetingRunResult, runDailyGreetings(), normalisePhone(), postToMeta(), sendHelloWorld(), sendWhatsAppTemplate(), sendWhatsAppText() (+1 more)

### Community 34 - "Module Group 34"
Cohesion: 0.23
Nodes (11): applyStoreCreditAction(), AccountBalance, AccountCode, getAccountIds(), JournalEntryInput, JournalLine, paymentModeAccount(), postJournalEntry() (+3 more)

### Community 35 - "Module Group 35"
Cohesion: 0.24
Nodes (8): register(), sendReminderAction(), OverdueRow, ReminderRunResult, ReminderSetting, runDailyReminders(), interpolateTemplate(), GET()

### Community 36 - "Module Group 36"
Cohesion: 0.20
Nodes (8): CustomerOption, DiscountScheme, InvoiceBuilderProps, ItemOption, PAYMENT_MODES, WarehouseOption, DiscountType, LineItemDraft

### Community 37 - "Module Group 37"
Cohesion: 0.29
Nodes (7): GET(), AuthLayout(), GlobalSearch(), TYPE_ICON, TYPE_LABEL, requireAuth(), SearchResult

### Community 38 - "Module Group 38"
Cohesion: 0.22
Nodes (8): metadata, BillingImportForm(), ExtractedBilling, ExtractedItem, GST_OPTIONS, Props, Step, BillingImportPage()

### Community 39 - "Module Group 39"
Cohesion: 0.22
Nodes (6): createJournalEntryAction(), JournalSchema, LineSchema, Account, INIT, JournalLine

### Community 40 - "Module Group 40"
Cohesion: 0.28
Nodes (6): metadata, createCreditNoteAction(), CreditNoteSchema, LineSchema, postCreditNote(), NewRefundPage()

### Community 41 - "Module Group 41"
Cohesion: 0.22
Nodes (7): ItemColor, ItemOpt, ItemSize, Line, Props, SupplierOpt, WarehouseOpt

### Community 42 - "Module Group 42"
Cohesion: 0.25
Nodes (6): CustomerOpt, InvoiceItem, Props, RefundLine, SearchInvoice, WarehouseOpt

### Community 43 - "Module Group 43"
Cohesion: 0.33
Nodes (5): metadata, STATUS_BADGE, WaToast(), InvoiceDetailPage(), cancelInvoiceAction()

### Community 44 - "Module Group 44"
Cohesion: 0.29
Nodes (4): metadata, Props, ItemDetailPage(), Item

### Community 45 - "Module Group 45"
Cohesion: 0.29
Nodes (4): Props, DuesPage(), InvoiceRow, metadata

### Community 46 - "Module Group 46"
Cohesion: 0.29
Nodes (5): Line, PurchaseInvoiceOpt, PurchaseItem, SupplierOpt, WarehouseOpt

### Community 47 - "Module Group 47"
Cohesion: 0.40
Nodes (4): togglePurchaseOrdersAction(), CARDS, metadata, SettingsPage()

### Community 48 - "Module Group 48"
Cohesion: 0.33
Nodes (5): toggleUserActiveAction(), metadata, ROLE_BADGE, UserRow, UsersPage()

### Community 49 - "Module Group 49"
Cohesion: 0.50
Nodes (4): fyMonths(), Gstr1Page(), InvoiceRow, metadata

### Community 50 - "Module Group 50"
Cohesion: 0.50
Nodes (4): fyMonths(), HsnPage(), HsnRow, metadata

### Community 51 - "Module Group 51"
Cohesion: 0.40
Nodes (4): Account, LedgerLine, LedgerPage(), metadata

### Community 52 - "Module Group 52"
Cohesion: 0.50
Nodes (3): metadata, BADGE, PurchaseDetailPage()

### Community 53 - "Module Group 53"
Cohesion: 0.50
Nodes (3): ACTION_BADGE, AuditLogPage(), metadata

### Community 54 - "Module Group 54"
Cohesion: 0.50
Nodes (3): ExpenseRow, ExpensesPage(), metadata

### Community 55 - "Module Group 55"
Cohesion: 0.50
Nodes (3): DataExportPage(), EXPORTS, metadata

### Community 56 - "Module Group 56"
Cohesion: 0.67
Nodes (3): fyMonths(), Gstr3bPage(), metadata

### Community 57 - "Module Group 57"
Cohesion: 0.50
Nodes (3): JournalEntry, JournalPage(), metadata

### Community 58 - "Module Group 58"
Cohesion: 0.50
Nodes (3): ALL_REPORTS, metadata, ReportsIndexPage()

## Knowledge Gaps
- **373 isolated node(s):** `metadata`, `ExpenseSchema`, `INIT`, `Category`, `metadata` (+368 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireRole()` connect `CRM, Designs & Reminders` to `Invoice & Search API Routes`, `Billing Import & Debit Note Forms`, `Warehouse Settings Management`, `Tailoring Order Flow`, `Purchase Listing & Search UI`, `AI Import Wizards`, `Invoice Builder & Tailoring UI`, `Customer Detail & Edit Pages`, `Expense Tracking & Forms`, `Design Portal Actions`, `Inventory & Supplier Import API`, `Inventory Item Management`, `Reports & Dashboard Pages`, `Supplier Management Pages`, `Module Group 21`, `Module Group 22`, `Module Group 23`, `Module Group 24`, `Module Group 25`, `Module Group 26`, `Module Group 27`, `Module Group 28`, `Module Group 29`, `Module Group 30`, `Module Group 33`, `Module Group 34`, `Module Group 35`, `Module Group 37`, `Module Group 38`, `Module Group 39`, `Module Group 40`, `Module Group 43`, `Module Group 44`, `Module Group 45`, `Module Group 47`, `Module Group 48`, `Module Group 49`, `Module Group 50`, `Module Group 51`, `Module Group 52`, `Module Group 53`, `Module Group 54`, `Module Group 55`, `Module Group 56`, `Module Group 57`, `Module Group 58`, `Module Group 59`, `Module Group 61`, `Module Group 63`, `Module Group 64`, `Module Group 65`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Why does `query()` connect `Invoice Builder & Tailoring UI` to `PDF Rendering & Document Export`, `Invoice & Search API Routes`, `Billing Import & Debit Note Forms`, `Warehouse Settings Management`, `Tailoring Order Flow`, `Purchase Listing & Search UI`, `CRM, Designs & Reminders`, `AI Import Wizards`, `Customer Detail & Edit Pages`, `Design Portal Actions`, `Inventory Item Management`, `Reports & Dashboard Pages`, `Supplier Management Pages`, `Module Group 23`, `Module Group 25`, `Module Group 27`, `Module Group 28`, `Module Group 30`, `Module Group 35`, `Module Group 37`, `Module Group 38`, `Module Group 40`, `Module Group 43`, `Module Group 44`, `Module Group 47`, `Module Group 52`, `Module Group 53`, `Module Group 59`, `Module Group 61`, `Module Group 63`, `Module Group 64`, `Module Group 65`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `formatInr()` connect `Reports & Dashboard Pages` to `Billing Import & Debit Note Forms`, `Tailoring Order Flow`, `Purchase Listing & Search UI`, `Invoice Builder & Tailoring UI`, `Customer Detail & Edit Pages`, `Expense Tracking & Forms`, `Module Group 22`, `Module Group 28`, `Module Group 35`, `Module Group 36`, `Module Group 41`, `Module Group 42`, `Module Group 43`, `Module Group 45`, `Module Group 46`, `Module Group 49`, `Module Group 50`, `Module Group 51`, `Module Group 52`, `Module Group 54`, `Module Group 56`, `Module Group 59`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `requireRole()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`requireRole()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `query()` (e.g. with `GET()` and `GET()`) actually correct?**
  _`query()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `formatInr()` (e.g. with `CreditNoteDetailPage()` and `CustomerDetailPage()`) actually correct?**
  _`formatInr()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `getSession()` (e.g. with `GET()` and `GET()`) actually correct?**
  _`getSession()` has 6 INFERRED edges - model-reasoned connections that need verification._