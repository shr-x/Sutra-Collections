# Graph Report - .  (2026-06-25)

## Corpus Check
- 228 files · ~100,156 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 2359 edges · 80 communities (62 shown, 18 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 119 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Invoice Management Pages|Invoice Management Pages]]
- [[_COMMUNITY_REST API Routes|REST API Routes]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Tailoring Order Pages|Tailoring Order Pages]]
- [[_COMMUNITY_Accounting & Design Forms|Accounting & Design Forms]]
- [[_COMMUNITY_Purchases & Search UI|Purchases & Search UI]]
- [[_COMMUNITY_Customer Management|Customer Management]]
- [[_COMMUNITY_Settings & DB Migrations|Settings & DB Migrations]]
- [[_COMMUNITY_ERP Architecture Docs|ERP Architecture Docs]]
- [[_COMMUNITY_AI Import Wizards|AI Import Wizards]]
- [[_COMMUNITY_Design Portal|Design Portal]]
- [[_COMMUNITY_Shared Type Definitions|Shared Type Definitions]]
- [[_COMMUNITY_User Management|User Management]]
- [[_COMMUNITY_PDF Generation|PDF Generation]]
- [[_COMMUNITY_Search & Audit|Search & Audit]]
- [[_COMMUNITY_Auth Layout & Global Search|Auth Layout & Global Search]]
- [[_COMMUNITY_Warehouse Settings|Warehouse Settings]]
- [[_COMMUNITY_GST Calculation Engine|GST Calculation Engine]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Supplier Management|Supplier Management]]
- [[_COMMUNITY_Credit Notes & Billing Import|Credit Notes & Billing Import]]
- [[_COMMUNITY_Import & Data Routes|Import & Data Routes]]
- [[_COMMUNITY_CreditDebit Notes & Reports|Credit/Debit Notes & Reports]]
- [[_COMMUNITY_Stock Movement Actions|Stock Movement Actions]]
- [[_COMMUNITY_Financial Statements|Financial Statements]]
- [[_COMMUNITY_Accounting Engine|Accounting Engine]]
- [[_COMMUNITY_PDF Invoice Template|PDF Invoice Template]]
- [[_COMMUNITY_Authentication & Login|Authentication & Login]]
- [[_COMMUNITY_Payroll Management|Payroll Management]]
- [[_COMMUNITY_Discount Schemes|Discount Schemes]]
- [[_COMMUNITY_Quotation Management|Quotation Management]]
- [[_COMMUNITY_Inventory Item Forms|Inventory Item Forms]]
- [[_COMMUNITY_WhatsApp Reminder Component|WhatsApp Reminder Component]]
- [[_COMMUNITY_Attendance Tracking|Attendance Tracking]]
- [[_COMMUNITY_Business Settings|Business Settings]]
- [[_COMMUNITY_Item Picker Modal|Item Picker Modal]]
- [[_COMMUNITY_Staff & Sales Reports|Staff & Sales Reports]]
- [[_COMMUNITY_Invoice Builder Component|Invoice Builder Component]]
- [[_COMMUNITY_Billing AI Import|Billing AI Import]]
- [[_COMMUNITY_Shared UI Components|Shared UI Components]]
- [[_COMMUNITY_Purchase Entry Form|Purchase Entry Form]]
- [[_COMMUNITY_Debit Notes|Debit Notes]]
- [[_COMMUNITY_Inventory Item CRUD|Inventory Item CRUD]]
- [[_COMMUNITY_Expense Management|Expense Management]]
- [[_COMMUNITY_Purchase Invoice & Accounting|Purchase Invoice & Accounting]]
- [[_COMMUNITY_Item Detail & Photos|Item Detail & Photos]]
- [[_COMMUNITY_Journal Entry Form|Journal Entry Form]]
- [[_COMMUNITY_Journal Entry Detail|Journal Entry Detail]]
- [[_COMMUNITY_Attendance API|Attendance API]]
- [[_COMMUNITY_GSTR-1 Filing|GSTR-1 Filing]]
- [[_COMMUNITY_HSN Summary Report|HSN Summary Report]]
- [[_COMMUNITY_Ledger View|Ledger View]]
- [[_COMMUNITY_Purchase Detail|Purchase Detail]]
- [[_COMMUNITY_Daybook Report|Daybook Report]]
- [[_COMMUNITY_Customer Dues|Customer Dues]]
- [[_COMMUNITY_Expense Listing|Expense Listing]]
- [[_COMMUNITY_Data Export|Data Export]]
- [[_COMMUNITY_GSTR-3B Filing|GSTR-3B Filing]]
- [[_COMMUNITY_Reports Index|Reports Index]]
- [[_COMMUNITY_Customer Import Save|Customer Import Save]]
- [[_COMMUNITY_Inventory Import Save|Inventory Import Save]]
- [[_COMMUNITY_Supplier Import Save|Supplier Import Save]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Best Sellers CSV Export|Best Sellers CSV Export]]
- [[_COMMUNITY_Delete Button Component|Delete Button Component]]
- [[_COMMUNITY_Daybook CSV Export|Daybook CSV Export]]
- [[_COMMUNITY_Sales Report|Sales Report]]
- [[_COMMUNITY_Staff CSV Export|Staff CSV Export]]
- [[_COMMUNITY_Category CSV Export|Category CSV Export]]
- [[_COMMUNITY_Backup Script|Backup Script]]
- [[_COMMUNITY_Invoice Business Rules|Invoice Business Rules]]
- [[_COMMUNITY_Docker Entrypoint|Docker Entrypoint]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Auto-Updater Script|Auto-Updater Script]]
- [[_COMMUNITY_Measurement Versioning Rule|Measurement Versioning Rule]]
- [[_COMMUNITY_Docker Updater Service|Docker Updater Service]]

## God Nodes (most connected - your core abstractions)
1. `requireRole()` - 283 edges
2. `query()` - 200 edges
3. `formatInr()` - 67 edges
4. `getSession()` - 46 edges
5. `pool` - 46 edges
6. `ActionResult` - 26 edges
7. `calcInvoiceTotals()` - 21 edges
8. `verifySession()` - 17 edges
9. `Sutra Collections ERP System` - 17 edges
10. `nextInvoiceNumber()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Sutra Collections Brand Logo` --conceptually_related_to--> `Sutra Collections ERP System`  [INFERRED]
  uploads/logo.jpg → CLAUDE.md
- `JournalEntryDetailPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/accounting/journal/[id]/page.tsx → lib/auth.ts
- `BillingImportPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/billing/import/page.tsx → lib/auth.ts
- `EditCustomerPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/customers/[id]/edit/page.tsx → lib/auth.ts
- `CustomersImportPage()` --calls--> `requireRole()`  [INFERRED]
  app/(auth)/customers/import/page.tsx → lib/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Docker Services with Health-Checked DB Dependency** — docker_compose_db_service, docker_compose_app_service, docker_compose_backup_service [EXTRACTED 1.00]
- **Phase 8 CRM & Reporting Feature Set** — memory_project_phase8_loyalty_points, memory_project_phase8_greetings_cron, memory_project_phase8_customer_insights, memory_project_phase8_audit_log, memory_project_phase8_reports, memory_project_phase8_csv_export [EXTRACTED 1.00]
- **ERP Role-Based Access Control (Admin, Accountant, Staff)** — claude_md_role_admin, claude_md_role_accountant, claude_md_role_staff, claude_md_iron_session [EXTRACTED 1.00]

## Communities (80 total, 18 thin omitted)

### Community 0 - "Invoice Management Pages"
Cohesion: 0.07
Nodes (38): metadata, metadata, STATUS_BADGE, metadata, Props, WaToast(), EditInvoicePage(), GET() (+30 more)

### Community 1 - "REST API Routes"
Cohesion: 0.12
Nodes (25): GET(), GET(), DELETE(), DELETE(), POST(), DELETE(), GET(), POST() (+17 more)

### Community 2 - "Package Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, bcryptjs, jose, next, node-cron, pg, qrcode, react (+30 more)

### Community 3 - "Tailoring Order Pages"
Cohesion: 0.07
Nodes (29): metadata, NEXT_LABEL, NEXT_STAGE, STAGE_BADGE, STAGE_LABEL, TailoringOrderDetailPage(), CustomerOption, DesignOption (+21 more)

### Community 4 - "Accounting & Design Forms"
Cohesion: 0.08
Nodes (22): metadata, metadata, metadata, metadata, metadata, metadata, GET(), EditDesignPage() (+14 more)

### Community 5 - "Purchases & Search UI"
Cohesion: 0.08
Nodes (24): metadata, Props, SearchInput(), BADGE, CreditNotesPage(), metadata, DebitNotesPage(), metadata (+16 more)

### Community 6 - "Customer Management"
Cohesion: 0.12
Nodes (19): metadata, metadata, metadata, ConfirmForm(), Props, createCustomerAction(), CustomerSchema, CustomerState (+11 more)

### Community 7 - "Settings & DB Migrations"
Cohesion: 0.09
Nodes (17): metadata, metadata, EditReminderPage(), pool, NewReminderPage(), createReminderAction(), deleteReminderAction(), ReminderSchema (+9 more)

### Community 8 - "ERP Architecture Docs"
Cohesion: 0.11
Nodes (28): Build Phases (Foundation through Polish), Cloudflare Tunnel (shr-x.in), Docker Compose Containerization, Sutra Collections ERP System, Gemini API (AI Import), GST Tax-Inclusive Pricing Rule, GST Setup (Regular, Monthly GSTR-1+3B, CGST+SGST), Iron-Session Auth (+20 more)

### Community 9 - "AI Import Wizards"
Cohesion: 0.11
Nodes (18): metadata, metadata, metadata, ImportColumn, ImportWizard(), Props, SaveResult, Step (+10 more)

### Community 10 - "Design Portal"
Cohesion: 0.13
Nodes (12): metadata, addFieldAction(), createDesignAction(), deleteDesignAction(), deleteFieldAction(), DesignSchema, DesignState, FieldSchema (+4 more)

### Community 11 - "Shared Type Definitions"
Cohesion: 0.09
Nodes (22): CreditNote, CreditNoteStatus, DebitNote, Design, DesignMeasurementField, DiscountScheme, Invoice, InvoiceItem (+14 more)

### Community 12 - "User Management"
Cohesion: 0.12
Nodes (16): metadata, metadata, EditUserPage(), NewUserPage(), createUserAction(), FormState, NewUserSchema, toggleUserActiveAction() (+8 more)

### Community 13 - "PDF Generation"
Cohesion: 0.20
Nodes (15): GET(), GET(), GET(), fmtDate(), getSecret(), signSession(), verifySession(), logoutAction() (+7 more)

### Community 14 - "Search & Audit"
Cohesion: 0.11
Nodes (14): GET(), metadata, ACTION_BADGE, AuditLogPage(), metadata, JournalEntry, JournalPage(), metadata (+6 more)

### Community 15 - "Auth Layout & Global Search"
Cohesion: 0.10
Nodes (17): AuthLayout(), GlobalSearch(), TYPE_ICON, TYPE_LABEL, ACCOUNTING_CHILDREN, BILLING_CHILDREN, CUSTOMERS_CHILDREN, NAV_ITEMS (+9 more)

### Community 16 - "Warehouse Settings"
Cohesion: 0.15
Nodes (13): metadata, metadata, EditWarehousePage(), NewWarehousePage(), Warehouse, createWarehouseAction(), deleteWarehouseAction(), updateWarehouseAction() (+5 more)

### Community 17 - "GST Calculation Engine"
Cohesion: 0.12
Nodes (16): calcInvoiceTotals(), calcLine(), round2(), CustomerOpt, InvoiceItem, RefundForm(), RefundLine, SearchInvoice (+8 more)

### Community 18 - "TypeScript Configuration"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 19 - "Supplier Management"
Cohesion: 0.18
Nodes (12): metadata, metadata, EditSupplierPage(), NewSupplierPage(), createSupplierAction(), deleteSupplierAction(), parse(), SupplierSchema (+4 more)

### Community 20 - "Credit Notes & Billing Import"
Cohesion: 0.17
Nodes (12): POST(), metadata, createCreditNoteAction(), CreditNoteSchema, LineSchema, postCreditNote(), currentFY(), DocType (+4 more)

### Community 21 - "Import & Data Routes"
Cohesion: 0.25
Nodes (12): POST(), POST(), POST(), POST(), BlobPart, callGeminiJson(), EXCEL_MIME, excelToText() (+4 more)

### Community 22 - "Credit/Debit Notes & Reports"
Cohesion: 0.15
Nodes (12): metadata, metadata, metadata, BillingPage(), metadata, DashboardPage(), metadata, CreditNoteDetailPage() (+4 more)

### Community 23 - "Stock Movement Actions"
Cohesion: 0.15
Nodes (12): ALL_TYPES, createStockMovementAction(), IN_TYPES, MovementSchema, MovementState, OUT_TYPES, ItemWithVariants, MOVEMENT_LABELS (+4 more)

### Community 24 - "Financial Statements"
Cohesion: 0.17
Nodes (11): AccountingPage(), metadata, BalanceSheetPage(), metadata, getAccountBalances(), currentFyRange(), metadata, ProfitLossPage() (+3 more)

### Community 25 - "Accounting Engine"
Cohesion: 0.19
Nodes (14): createJournalEntryAction(), JournalSchema, LineSchema, AccountBalance, AccountCode, getAccountIds(), JournalEntryInput, JournalLine (+6 more)

### Community 26 - "PDF Invoice Template"
Cohesion: 0.19
Nodes (13): fmt(), InvoiceDoc(), PdfCompany, PdfCustomer, PdfInvoiceData, PdfLineItem, S, fmt() (+5 more)

### Community 27 - "Authentication & Login"
Cohesion: 0.15
Nodes (9): RootPage(), ROLE_HOME, COOKIE_OPTIONS, loginAction(), LoginSchema, LoginState, LoginPage(), metadata (+1 more)

### Community 28 - "Payroll Management"
Cohesion: 0.16
Nodes (11): runPayrollAction(), RunPayrollInput, updateBaseSalaryAction(), daysInMonth(), metadata, PayrollPage(), AttendanceSummary, PayrollClient() (+3 more)

### Community 29 - "Discount Schemes"
Cohesion: 0.18
Nodes (10): metadata, metadata, EditSchemePage(), NewSchemePage(), createSchemeAction(), SchemeSchema, toggleSchemeAction(), updateSchemeAction() (+2 more)

### Community 30 - "Quotation Management"
Cohesion: 0.19
Nodes (10): metadata, STATUS_BADGE, metadata, QuotationDetailPage(), NewQuotationPage(), convertQuotationToInvoiceAction(), createQuotationAction(), LineSchema (+2 more)

### Community 31 - "Inventory Item Forms"
Cohesion: 0.22
Nodes (7): metadata, ItemState, GST_PRESETS, Props, NewItemPage(), ItemCategory, ItemUnit

### Community 32 - "WhatsApp Reminder Component"
Cohesion: 0.18
Nodes (8): INIT, Props, Setting, Props, ItemOpt, Props, SchemeData, ActionResult

### Community 33 - "Attendance Tracking"
Cohesion: 0.18
Nodes (9): AttendanceStatus, DAY_NAMES, DayEntry, Props, StaffUser, STATUS_CONFIG, AttendancePage(), daysInMonth() (+1 more)

### Community 34 - "Business Settings"
Cohesion: 0.20
Nodes (7): BusinessFormState, saveBusinessSettingsAction(), INITIAL, Props, BusinessProfilePage(), metadata, SETTING_KEYS

### Community 35 - "Item Picker Modal"
Cohesion: 0.17
Nodes (6): COLOR_HEX, ItemPickerModalProps, PickerAddEvent, PickerColor, PickerItem, PickerSize

### Community 36 - "Staff & Sales Reports"
Cohesion: 0.18
Nodes (8): metadata, BestSellersPage(), metadata, InvoiceDiscountInput, InvoiceTotals, LineCalc, LineResult, StaffPerformancePage()

### Community 37 - "Invoice Builder Component"
Cohesion: 0.20
Nodes (8): CustomerOption, InvoiceBuilder(), InvoiceBuilderProps, ItemOption, PAYMENT_MODES, WarehouseOption, DiscountType, LineItemDraft

### Community 38 - "Billing AI Import"
Cohesion: 0.22
Nodes (8): metadata, BillingImportForm(), ExtractedBilling, ExtractedItem, GST_OPTIONS, Props, Step, BillingImportPage()

### Community 39 - "Shared UI Components"
Cohesion: 0.22
Nodes (7): ConfirmDialog(), ConfirmDialogProps, Color, Size, SizeColorManagerProps, StockCell, Warehouse

### Community 40 - "Purchase Entry Form"
Cohesion: 0.20
Nodes (8): ItemColor, ItemOpt, ItemSize, Line, Props, PurchaseForm(), SupplierOpt, WarehouseOpt

### Community 41 - "Debit Notes"
Cohesion: 0.28
Nodes (6): metadata, createDebitNoteAction(), DebitNoteSchema, LineSchema, postDebitNote(), NewDebitNotePage()

### Community 42 - "Inventory Item CRUD"
Cohesion: 0.36
Nodes (7): metadata, EditItemPage(), createItemAction(), ItemSchema, parseItem(), resolveItemType(), updateItemAction()

### Community 43 - "Expense Management"
Cohesion: 0.28
Nodes (5): createExpenseAction(), ExpenseSchema, Category, INIT, postExpense()

### Community 44 - "Purchase Invoice & Accounting"
Cohesion: 0.32
Nodes (6): metadata, postPurchaseInvoice(), NewPurchasePage(), createPurchaseInvoiceAction(), LineSchema, PurchaseSchema

### Community 45 - "Item Detail & Photos"
Cohesion: 0.29
Nodes (4): metadata, Props, ItemDetailPage(), Item

### Community 46 - "Journal Entry Form"
Cohesion: 0.33
Nodes (3): Account, INIT, JournalLine

### Community 47 - "Journal Entry Detail"
Cohesion: 0.40
Nodes (4): metadata, JournalEntryDetailPage(), JournalEntryRow, JournalLineRow

### Community 48 - "Attendance API"
Cohesion: 0.40
Nodes (4): AttendanceStatus, DELETE(), POST(), VALID_STATUS

### Community 49 - "GSTR-1 Filing"
Cohesion: 0.50
Nodes (4): fyMonths(), Gstr1Page(), InvoiceRow, metadata

### Community 50 - "HSN Summary Report"
Cohesion: 0.50
Nodes (4): fyMonths(), HsnPage(), HsnRow, metadata

### Community 51 - "Ledger View"
Cohesion: 0.40
Nodes (4): Account, LedgerLine, LedgerPage(), metadata

### Community 52 - "Purchase Detail"
Cohesion: 0.50
Nodes (3): metadata, BADGE, PurchaseDetailPage()

### Community 53 - "Daybook Report"
Cohesion: 0.50
Nodes (3): DaybookPage(), DaybookRow, metadata

### Community 54 - "Customer Dues"
Cohesion: 0.50
Nodes (3): DuesPage(), DuesRow, metadata

### Community 55 - "Expense Listing"
Cohesion: 0.50
Nodes (3): ExpenseRow, ExpensesPage(), metadata

### Community 56 - "Data Export"
Cohesion: 0.50
Nodes (3): DataExportPage(), EXPORTS, metadata

### Community 57 - "GSTR-3B Filing"
Cohesion: 0.67
Nodes (3): fyMonths(), Gstr3bPage(), metadata

### Community 58 - "Reports Index"
Cohesion: 0.50
Nodes (3): ALL_REPORTS, metadata, ReportsIndexPage()

## Knowledge Gaps
- **373 isolated node(s):** `metadata`, `ExpenseSchema`, `INIT`, `Category`, `metadata` (+368 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireRole()` connect `Accounting & Design Forms` to `Invoice Management Pages`, `Tailoring Order Pages`, `Purchases & Search UI`, `Customer Management`, `Settings & DB Migrations`, `AI Import Wizards`, `Design Portal`, `User Management`, `Search & Audit`, `Warehouse Settings`, `Supplier Management`, `Credit Notes & Billing Import`, `Import & Data Routes`, `Credit/Debit Notes & Reports`, `Stock Movement Actions`, `Financial Statements`, `Accounting Engine`, `Payroll Management`, `Discount Schemes`, `Quotation Management`, `Inventory Item Forms`, `Attendance Tracking`, `Business Settings`, `Staff & Sales Reports`, `Billing AI Import`, `Debit Notes`, `Inventory Item CRUD`, `Expense Management`, `Purchase Invoice & Accounting`, `Item Detail & Photos`, `Journal Entry Detail`, `Attendance API`, `GSTR-1 Filing`, `HSN Summary Report`, `Ledger View`, `Purchase Detail`, `Daybook Report`, `Customer Dues`, `Expense Listing`, `Data Export`, `GSTR-3B Filing`, `Reports Index`, `Customer Import Save`, `Inventory Import Save`, `Supplier Import Save`, `Best Sellers CSV Export`, `Daybook CSV Export`, `Sales Report`, `Staff CSV Export`, `Category CSV Export`?**
  _High betweenness centrality (0.256) - this node is a cross-community bridge._
- **Why does `query()` connect `REST API Routes` to `Invoice Management Pages`, `Tailoring Order Pages`, `Accounting & Design Forms`, `Purchases & Search UI`, `Customer Management`, `AI Import Wizards`, `Design Portal`, `PDF Generation`, `Search & Audit`, `Auth Layout & Global Search`, `Warehouse Settings`, `Supplier Management`, `Credit Notes & Billing Import`, `Credit/Debit Notes & Reports`, `Stock Movement Actions`, `PDF Invoice Template`, `Authentication & Login`, `Discount Schemes`, `Quotation Management`, `Inventory Item Forms`, `Business Settings`, `Staff & Sales Reports`, `Billing AI Import`, `Debit Notes`, `Inventory Item CRUD`, `Purchase Invoice & Accounting`, `Item Detail & Photos`, `Purchase Detail`, `Daybook Report`, `Best Sellers CSV Export`, `Daybook CSV Export`, `Sales Report`, `Staff CSV Export`, `Category CSV Export`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `formatInr()` connect `Credit/Debit Notes & Reports` to `Invoice Management Pages`, `Tailoring Order Pages`, `Purchases & Search UI`, `Customer Management`, `GST Calculation Engine`, `Financial Statements`, `Payroll Management`, `Quotation Management`, `Staff & Sales Reports`, `Invoice Builder Component`, `Purchase Entry Form`, `GSTR-1 Filing`, `HSN Summary Report`, `Ledger View`, `Purchase Detail`, `Daybook Report`, `Customer Dues`, `Expense Listing`, `GSTR-3B Filing`, `Sales Report`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `requireRole()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`requireRole()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **Are the 30 inferred relationships involving `query()` (e.g. with `GET()` and `GET()`) actually correct?**
  _`query()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `formatInr()` (e.g. with `CreditNoteDetailPage()` and `CustomerDetailPage()`) actually correct?**
  _`formatInr()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `getSession()` (e.g. with `GET()` and `DELETE()`) actually correct?**
  _`getSession()` has 4 INFERRED edges - model-reasoned connections that need verification._