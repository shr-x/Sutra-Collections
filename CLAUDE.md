# Sutra Collections ERP — Standing Instructions for Claude Code

**Business:** Sutra Collections
**Developer:** SHR-X
**Domain:** shr-x.in (Cloudflare Tunnel)

---

## What We're Building
A full ERP for a clothing shop that sells finished goods AND does made-to-measure tailoring.
Replaces myBillBook with a custom system that includes GST billing, inventory, accounting,
tailoring order tracking, and CRM.

---

## Stack (non-negotiable)
- **Framework:** Next.js App Router (full-stack, single codebase)
- **Database:** PostgreSQL
- **Containerization:** Docker Compose with `restart: always`
- **Auth:** Session-based (iron-session or similar), no NextAuth unless fits well
- **Public access:** Cloudflare Tunnel — domain shr-x.in
- **Notifications:** Meta WhatsApp Cloud API + Email (no SMS, no Razorpay, no payment gateways)
- **AI Import:** Gemini API (per-module importers only)

---

## Roles (3 roles only)
| Role | Access |
|---|---|
| Admin | Everything |
| Accountant | Accounting + GST only — NO customer data, NO design portal |
| Staff | Billing + design portal + customers — tied to ONE warehouse, NO accounting |

- Auto session timeout: 3 hours idle
- Staff access can be time-boxed (expiry date set by Admin)
- Warehouse-scoped: Staff sees only their assigned warehouse

---

## Key Business Rules (always enforce)
1. **GST is tax-inclusive by default** — price entered = final price customer pays. Back-calculate taxable value + CGST + SGST from inclusive price.
2. **Exception:** Buy-X-Get-Y / scheme invoices are tax-EXCLUSIVE (GST added on top).
3. **Credit only for customers with a phone number on file.** No phone = no credit.
4. **Invoice edit grace window:** 1 hour after creation. After that, locked — corrections via Credit Note / Debit Note only.
5. **Invoice numbering:** FY-based, format `INV/2026-27/0001`, resets each financial year.
6. **HSN codes:** minimum 4 digits.
7. **E-Way Bill:** No API. Show a reminder banner on invoices above ₹50,000. Manual generation on GST portal.
8. **Purchase Order:** OFF by default (direct Purchase Invoice). Toggleable ON in settings.
9. **Raw materials:** NOT auto-deducted by tailoring orders. Recorded only.
10. **Measurements:** versioned per customer — never overwrite, always save new version.
11. **Backups:** Automated daily local PostgreSQL dump. Local-only (acknowledged risk).

---

## GST Setup
- Scheme: Regular (not Composition)
- Slabs: 5% / 12% / 18% / 28% per item
- Filing: Monthly (GSTR-1 + GSTR-3B)
- All branches same state → CGST + SGST split only (no IGST)
- Single GSTIN across all warehouses

---

## Payments (manual, no gateway)
- UPI QR code on every invoice (server-side generated from `upi://pay?pa=<VPA>&am=<amount>&tn=<invoice-id>`)
- Staff marks: Cash / Card / UPI / Credit
- No bank reconciliation, no auto-detection

---

## Build Phases (follow this order)
1. **Foundation** ← WE ARE HERE
2. Inventory & Parties
3. Billing
4. Accounting
5. Credit & Dues
6. Payments
7. Design Portal (Tailoring)
8. CRM & Reports
9. AI Import (Gemini)
10. Staff Ops
11. Polish

---

## Code Style
- TypeScript everywhere
- Zod for all input validation
- Server Actions preferred over API routes where possible
- Keep components small and focused
- Comment complex business logic (especially GST calculations)
- Always handle errors gracefully with user-visible messages

---

## Never Do
- Don't use Razorpay or any payment gateway
- Don't send SMS
- Don't use MongoDB
- Don't make it multi-tenant (single business only)
- Don't auto-deduct raw materials in tailoring orders
- Don't build a customer self-service portal (tailoring is staff-operated only)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
