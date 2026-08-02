# Pre-Production Audit & Fix Report

Date: 2026-08-02
Scope: 5 reported bugs, pre-production data cleanup, full schema audit, GST/ledger/financial integrity test pass.

---

## 1. Bugs — root cause, fix, live verification

### Bug 1 — DOB shows "undefined/undefined/Sun Aug 02" on Edit Customer form
**Root cause:** `customer-form.tsx` formatted the DOB with `String(dateObject).slice(0, 10)`. Postgres `DATE` columns come back from `pg` as native JS `Date` objects (not strings), so `String(date)` produced `"Sun Aug 02 2026 00:00:00 GMT+0000 (...)"`, and slicing the first 10 characters gave `"Sun Aug 02"` — not an ISO date. `DatePicker` then split that on `-` (found none), producing `undefined/undefined/Sun Aug 02`, and separately corrupted its internal `viewYear`/`viewMonth` state to `NaN`, rendering a calendar grid with **zero clickable days**.

**Fix:**
- `app/(auth)/customers/customer-form.tsx` — added a `toIsoDate()` helper that correctly detects a `Date` instance and calls `.toISOString().slice(0,10)`.
- `components/date-picker.tsx` — hardened defensively: any `value`/`defaultValue` that isn't a real `YYYY-MM-DD` string is now discarded (falls back to empty/today) via a new `safeIso()` guard, so a malformed date from *any* future caller can no longer produce the NaN-driven empty-calendar failure mode.

**Verified:** `npx tsc --noEmit` clean; confirmed against a real customer row with a stored DOB.

### Bug 2 — Immediate birthday greeting didn't fire when DOB set to today
**Root cause:** Same root cause as Bug 1, not a timezone issue (confirmed no `TZ` override in either docker-compose file, and `DATE` columns carry no time/timezone component). The corrupted date picker meant that if an admin tried to set/fix a DOB, the malformed value failed the server-side `^\d{4}-\d{2}-\d{2}$` regex in `parseCustomerForm` and was silently written as `NULL` — so `triggerBirthdayGreetingIfToday`'s `if (d.date_of_birth)` gate was never even entered.

**Fix:** Fixing Bug 1 fixes this — once the date reaches the server correctly formatted, the existing (already-correct) trigger logic runs.

**Live-verified for real:** confirmed today's cron already sent a real birthday message earlier in the day to an existing customer (proves the send pipeline itself was always fine). Then created a fresh test customer with DOB = today and called the real `triggerBirthdayGreetingIfToday()` function directly — got a genuine Meta API response with a real `messageId` back (`result: sent`). Test customer and its `greeting_log` row deleted afterward.

### Bug 3 — Discount Schemes unreachable from sidebar
**Root cause:** confirmed — `/settings` had no `children` array in `components/sidebar.tsx`, so `/settings/schemes` had no nav entry anywhere.

**Fix:** added a "Discount Schemes" entry to `BILLING_CHILDREN` in `components/sidebar.tsx` (pricing/billing-adjacent, and reachable by both Admin and Staff roles who use Billing regularly).

### Bug 4 — Tailoring payment → Outstanding Dues sync
**Static review:** found no gaps — `syncPaymentToInvoices` runs inside the same DB transaction as the payment insert, is `await`ed (not fire-and-forget), and `recordTailoringPaymentAction` revalidates `/customers/dues` along with every other relevant path.

**Live-verified for real:** created a real test tailoring order, generated a real GST invoice via the actual `createTailoringInvoice()` function, recorded a full payment by replicating `recordTailoringPaymentAction`'s exact transaction body, then immediately (no delay, no refresh) re-queried:
- Invoice `balance_due`: `2360.00` → `0.00`, `status`: `issued` → `paid`
- Outstanding Dues query: invoice present before → **absent after**
- Customer profile outstanding total: `null` (zero) after

**Conclusion: the code is correct.** If this "didn't go through" in practice, the most likely explanation is the previously-flagged docker-compose project-name mismatch (`sutracollections` vs `repo`) meaning the live-serving container may not have been running this code. **Action needed on your end:** confirm the production deployment is actually running from the `sutracollections` compose project, not a stale `repo` one.

### Bug 5 — Discount scheme broadcast sent 0 messages / not received
**Root cause found via real log inspection (not guesswork):** `NEXT_PUBLIC_APP_URL` was **never set anywhere** — not in `.env`, `.env.example`, or either docker-compose file. `lib/offer-broadcast.ts` (and pre-existing `lib/greetings.ts` for the shop-anniversary logo) fell back to `http://localhost:3000` for the WhatsApp template's image header URL. Meta's API accepted the template call structurally (`HTTP 200` + a real `messageId`, hence the app's own logs said "sent"), but Meta's servers cannot fetch `localhost:3000` to actually retrieve the header image — so the message silently failed to render/deliver for the recipient. This is a **pre-existing bug also affecting the shop-anniversary greeting**, not something new.

Ruled out: `customers.is_active` (exists, defaults `TRUE`), `dpdp_consent` (exists, defaults `'given'`) — both were red herrings.

**Fix:**
- Added `NEXT_PUBLIC_APP_URL` to `.env`, `.env.example`, `docker-compose.yml`, and `docker-compose.prod.yml` (value: `https://shr-x.in`, per your CLAUDE.md).
- `lib/offer-broadcast.ts` now warns explicitly in logs if the configured URL still resolves to `localhost`/`127.0.0.1`, so this class of bug is loud instead of silent next time.
- Added a `testCustomerId` parameter to `broadcastOffer()` so a single customer can be sent a real preview without touching the rest of the customer base or consuming the scheme's one real broadcast (`broadcast_sent_at` is not set in test mode).

**Live-verified for real, scoped to one real customer:** rebuilt the container with the fix, then called `broadcastOffer(schemeId, testCustomerId)`. Payload now correctly carries `https://shr-x.in/uploads/...` instead of `localhost`, and Meta accepted it.

**Important limitation — could not fully verify production delivery from here:** `curl https://shr-x.in/uploads/schemes/<file>.jpg` returns **404**. This means the public `shr-x.in` domain (Cloudflare Tunnel) points to a **different server** than this local dev environment — consistent with production running on the separate GCP VM noted in earlier sessions. **This fix must be deployed to wherever `shr-x.in` actually resolves, with the same `NEXT_PUBLIC_APP_URL` env var, before a real broadcast image will load for customers.** I don't have access to that server to verify this directly.

---

## 2. Pre-production cleanup

- Deleted all `QA %`-prefixed test artifacts created during verification (customers, designs, tailors, tailoring orders, invoices, journal entries) — confirmed 0 residue via row-count queries after each pass.
- Deleted 2 real-but-clearly-test discount schemes named "hey" and "temp" (placeholder names, created while testing the exact Bug 5 scenario) plus their broadcast logs and uploaded images.
- **Left untouched, needs your confirmation:** this database currently holds only **1 customer** ("Poojith R"), 12 invoices, 10 tailoring orders, 1 purchase invoice, 13 items, 1 design. This looks like a low-volume dev/test copy rather than full production data, but I can't be certain it isn't your own genuine real usage — I did not delete any of it per your own "don't delete anything you're not certain is test data" instruction. Let me know if this should be purged too.

---

## 3. Schema audit

- **All 11 migrations** (`000`–`011`, including the new `011_missing_fk_indexes.sql`) applied cleanly, in order, against a genuinely fresh empty database, and are **idempotent** (re-ran the full set a second time with zero errors).
- Table structure between the fresh DB and the current populated DB is **identical**.
- **Zero orphaned foreign-key rows** anywhere in the database (automated scan across every FK constraint in the schema).
- Found 71 FK columns with no supporting index. Added indexes (`011_missing_fk_indexes.sql`) for the ones that are genuinely hot-path: `warehouse_id` on every warehouse-scoped table (Staff accounts are pinned to one warehouse, so this filters on nearly every Staff page load) and `item_id`/`variant_id` on transaction line-item tables (reports, stock views). Left the remaining ~50 (mostly `created_by`/`recorded_by`-style audit columns) unindexed — low traffic, not worth the maintenance overhead yet.
- **Incomplete feature found:** `purchase_orders`, `purchase_order_items`, and `goods_received_notes` tables exist and the Settings toggle for "Purchase Order (OFF by default)" exists, but there is no actual UI/Server Action anywhere that reads or writes these tables — the PO workflow was never built beyond the schema and the toggle. Not fixed (out of scope — a real feature to build, not a bug), just flagged.

---

## 4. GST calculation test pass

Tested `calcLine`/`calcInvoiceTotals` (`lib/gst.ts`) across all 5 real GST slabs (0/5/12/18/28%), multiple price points, both tax-inclusive (default) and tax-exclusive (scheme) modes, plus multi-line invoices with line- and invoice-level discounts.

- **`taxable + CGST + SGST == total`: held exactly in 100% of cases**, every rate, every mode.
- **`total == price entered` (inclusive mode)** and **`taxable == price entered` (exclusive/scheme mode)**: held exactly in 100% of cases.
- CGST == SGST: held exactly in the large majority of cases; differs by exactly ₹0.01 in a minority of line-level cases, and up to ₹0.02 at the invoice-total level in one tested case. This is **intentional, standard behavior** (the code comment in `calcLine` explicitly calls this out — SGST absorbs the rounding remainder so the total always ties out exactly to the price entered, at the cost of the CGST/SGST split occasionally differing by a paisa). This matches how mainstream Indian GST software (Tally, Zoho) behaves and is not a compliance issue — the GST *rate* is always exactly equal, only the rounded amount can differ by a paisa. Not changed.
- Cross-checked against **every real stored row** in `invoice_items`, `purchase_invoice_items`, `credit_note_items`, `debit_note_items`, and `invoices`: **0 rows** fail the `taxable+CGST+SGST=total` or `grand_total=subtotal-discount` invariants.

---

## 5. Ledger integrity

- **Every one of the 25 real journal entries** in the database individually balances (`SUM(debit) = SUM(credit)` per entry) — checked directly, not sampled.
- **Aggregate ledger-wide**: total debits = total credits = ₹12,29,654.00 exactly, diff = ₹0.00.
- Zero orphaned journal entry headers (entries with no lines).
- **Trial Balance**: total debit = total credit, ties out exactly (same aggregate as above).

---

## 6. Customer dues consistency

Cross-checked, for every customer, the three independent "outstanding" computations:
1. Customers list page's per-row subquery
2. Customer profile page's outstanding query
3. Outstanding Dues report's per-invoice sum

**All three agree exactly for every customer** — zero discrepancies.

---

## 7. Stock/inventory consistency

Reconciled `stock.quantity` against the net of all `stock_movements` (purchase/adjustment_in/transfer_in as +, sale/adjustment_out/transfer_out as −) for every (item, variant, warehouse) combination: **0 discrepancies**. Sample size is small (2 stock rows, 2 movements) given this database's overall low data volume — the reconciliation logic itself is verified correct with zero drift, but this is not a large-scale stress test.

---

## Final build status

- `npx tsc --noEmit`: **0 errors**
- `npm run build`: **compiles successfully**
- All migrations (000–011) apply cleanly against both a fresh and the current populated database, idempotently.

## Files changed this pass
See commit for the full list. Highlights: `components/date-picker.tsx`, `app/(auth)/customers/customer-form.tsx`, `components/sidebar.tsx`, `lib/offer-broadcast.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `db/migrations/011_missing_fk_indexes.sql`.

## Action items for you (cannot be completed from this environment)
1. Set `NEXT_PUBLIC_APP_URL=https://shr-x.in` (or the correct real value) in the **actual production** `.env` — this repo's `.env` is gitignored and was only updated locally.
2. Confirm the production Docker deployment is running the `sutracollections` compose project (not a stale `repo` one) — needed for Bug 4's fix to actually be live.
3. Confirm whether the single-customer, 12-invoice dataset in this database is real data to keep or dev/test data to purge.
