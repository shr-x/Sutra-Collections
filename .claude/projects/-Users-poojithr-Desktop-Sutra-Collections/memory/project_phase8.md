---
name: project-phase8
description: Phase 8 complete — CRM & Reports built on top of Phases 1-7
metadata:
  type: project
---

Phase 8 (CRM & Reports) is complete.

**Why:** Adds customer intelligence, loyalty, greetings, and reporting layer to the ERP.

**How to apply:** Build Phase 9 (AI Import/Gemini) next, or Phase 10 (Staff Ops).

## Features built
- Loyalty points: earn (auto on paid invoice), redeem at billing (invoice form)
- Birthday/Anniversary greetings: `/api/cron/greetings`, `lib/greetings.ts`
- Customer insights on `/customers/[id]`: LTV, invoice count, AOV, last purchase, loyalty history
- DOB + anniversary fields on customer create/edit
- Audit log: `lib/audit.ts`, wired into invoice create
- Reports: Daybook, Sales, Purchases, Best Sellers, Staff Performance, Audit Log, Export
- CSV export API routes: `/api/reports/{daybook,sales,purchases,best-sellers,staff,export/[type]}`
- Loyalty rate settings in Business Profile settings
- Sidebar: Reports section (admin + staff + accountant, each with role-appropriate links)

## DB tables added (run migration manually)
See SQL in conversation. Key tables: loyalty_transactions, audit_log, greeting_log
Key columns: customers.loyalty_points_balance, customers.date_of_birth, customers.anniversary_date, invoices.loyalty_points_redeemed
Key settings rows: loyalty_earn_rate, loyalty_redemption_rate
