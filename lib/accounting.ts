/**
 * Double-entry accounting engine.
 * All financial events call postJournalEntry() which writes balanced
 * debit/credit lines. Every event must balance: sum(debits) = sum(credits).
 */

import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';

type AccountCode =
  | '1001' | '1002' | '1100' | '1200' | '1201' | '1300'
  | '2001' | '2100' | '2101'
  | '3001' | '3002'
  | '4001' | '4002'
  | '5001' | '5100' | '5101' | '5102' | '5103';

export type ReferenceType =
  | 'invoice' | 'payment' | 'purchase' | 'credit_note'
  | 'debit_note' | 'expense' | 'manual';

export interface JournalLine {
  accountCode: AccountCode | string;
  debit: number;
  credit: number;
}

export interface JournalEntryInput {
  entryDate: string;           // YYYY-MM-DD
  description: string;
  referenceType?: ReferenceType;
  referenceId?: string;
  isManual?: boolean;
  createdBy: string;
  lines: JournalLine[];
}

/** Fetch account IDs by code (single query, used inside transactions). */
async function getAccountIds(
  codes: string[],
  client: PoolClient
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const res = await client.query<{ account_code: string; id: string }>(
    `SELECT account_code, id FROM accounts WHERE account_code = ANY($1)`,
    [codes]
  );
  const map = new Map<string, string>();
  for (const row of res.rows) map.set(row.account_code, row.id);
  return map;
}

/** Core: post a balanced journal entry inside an existing transaction. */
export async function postJournalEntry(
  entry: JournalEntryInput,
  client: PoolClient
): Promise<string> {
  const codes = Array.from(new Set(entry.lines.map((l) => l.accountCode)));
  const accountMap = await getAccountIds(codes, client);

  const missingAccounts = codes.filter((c) => !accountMap.has(c));
  if (missingAccounts.length) {
    throw new Error(`Unknown account codes: ${missingAccounts.join(', ')}`);
  }

  const res = await client.query<{ id: string }>(
    `INSERT INTO journal_entries (entry_date, description, reference_type, reference_id, is_manual, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      entry.entryDate,
      entry.description,
      entry.referenceType ?? null,
      entry.referenceId ?? null,
      entry.isManual ?? false,
      entry.createdBy,
    ]
  );
  const entryId = res.rows[0].id;

  for (const line of entry.lines) {
    if (line.debit === 0 && line.credit === 0) continue;
    await client.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
       VALUES ($1,$2,$3,$4)`,
      [entryId, accountMap.get(line.accountCode)!, round2(line.debit), round2(line.credit)]
    );
  }

  return entryId;
}

/** Map payment mode to asset account code. */
function paymentModeAccount(mode: string | null): AccountCode {
  if (mode === 'bank') return '1002';
  return '1001'; // cash / upi / card all treated as cash for accounting
}

// ─── Auto-post: Sales Invoice ─────────────────────────────────────────────────

export async function postSalesInvoice(
  params: {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: string;
    grandTotal: number;
    taxableValue: number;
    totalCgst: number;
    totalSgst: number;
    paymentMode: string | null;
    amountPaid: number;
    createdBy: string;
  },
  client: PoolClient
): Promise<void> {
  if (params.grandTotal <= 0) return;

  const balance = params.grandTotal - params.amountPaid;
  const paid = params.amountPaid;
  const payAcct = paymentModeAccount(params.paymentMode);

  const lines: JournalLine[] = [];

  // Debit side
  if (paid > 0) lines.push({ accountCode: payAcct, debit: paid, credit: 0 });
  if (balance > 0) lines.push({ accountCode: '1100', debit: balance, credit: 0 }); // AR

  // Credit side
  lines.push({ accountCode: '4001', debit: 0, credit: params.taxableValue });
  if (params.totalCgst > 0) lines.push({ accountCode: '2100', debit: 0, credit: params.totalCgst });
  if (params.totalSgst > 0) lines.push({ accountCode: '2101', debit: 0, credit: params.totalSgst });

  await postJournalEntry({
    entryDate: params.invoiceDate,
    description: `Sales Invoice ${params.invoiceNumber}`,
    referenceType: 'invoice',
    referenceId: params.invoiceId,
    createdBy: params.createdBy,
    lines,
  }, client);
}

// ─── Auto-post: Payment Received ─────────────────────────────────────────────

export async function postPaymentReceived(
  params: {
    invoiceId: string;
    invoiceNumber: string;
    paymentDate: string;
    amount: number;
    paymentMode: string;
    createdBy: string;
  },
  client: PoolClient
): Promise<void> {
  if (params.amount <= 0) return;
  const payAcct = paymentModeAccount(params.paymentMode);
  await postJournalEntry({
    entryDate: params.paymentDate,
    description: `Payment received — ${params.invoiceNumber}`,
    referenceType: 'payment',
    referenceId: params.invoiceId,
    createdBy: params.createdBy,
    lines: [
      { accountCode: payAcct, debit: params.amount, credit: 0 },
      { accountCode: '1100', debit: 0, credit: params.amount },
    ],
  }, client);
}

// ─── Auto-post: Purchase Invoice ─────────────────────────────────────────────

export async function postPurchaseInvoice(
  params: {
    purchaseId: string;
    purchaseNumber: string;
    purchaseDate: string;
    grandTotal: number;
    taxableValue: number;
    totalCgst: number;
    totalSgst: number;
    includeInGst: boolean;
    paymentMode: string | null;
    amountPaid: number;
    createdBy: string;
  },
  client: PoolClient
): Promise<void> {
  if (params.grandTotal <= 0) return;

  const balance = params.grandTotal - params.amountPaid;
  const paid = params.amountPaid;
  const payAcct = paymentModeAccount(params.paymentMode);

  const lines: JournalLine[] = [];

  // Debit: Inventory + ITC (if eligible)
  lines.push({ accountCode: '1300', debit: params.taxableValue, credit: 0 });
  if (params.includeInGst) {
    if (params.totalCgst > 0) lines.push({ accountCode: '1200', debit: params.totalCgst, credit: 0 });
    if (params.totalSgst > 0) lines.push({ accountCode: '1201', debit: params.totalSgst, credit: 0 });
  }

  // Credit: Cash/Bank (paid) + AP (unpaid)
  if (paid > 0) lines.push({ accountCode: payAcct, debit: 0, credit: paid });
  if (balance > 0) lines.push({ accountCode: '2001', debit: 0, credit: balance });

  await postJournalEntry({
    entryDate: params.purchaseDate,
    description: `Purchase Invoice ${params.purchaseNumber}`,
    referenceType: 'purchase',
    referenceId: params.purchaseId,
    createdBy: params.createdBy,
    lines,
  }, client);
}

// ─── Auto-post: Credit Note (Sales Return) ───────────────────────────────────

export async function postCreditNote(
  params: {
    creditNoteId: string;
    creditNoteNumber: string;
    noteDate: string;
    grandTotal: number;
    taxableValue: number;
    totalCgst: number;
    totalSgst: number;
    resolution: string | null;
    createdBy: string;
  },
  client: PoolClient
): Promise<void> {
  if (params.grandTotal <= 0) return;

  const lines: JournalLine[] = [
    { accountCode: '4001', debit: params.taxableValue, credit: 0 },
  ];
  if (params.totalCgst > 0) lines.push({ accountCode: '2100', debit: params.totalCgst, credit: 0 });
  if (params.totalSgst > 0) lines.push({ accountCode: '2101', debit: params.totalSgst, credit: 0 });

  // Credit to AR (refund from customer's perspective reduces what they owe)
  const creditAcct: AccountCode = params.resolution === 'refund' ? '1001' : '1100';
  lines.push({ accountCode: creditAcct, debit: 0, credit: params.grandTotal });

  // Resolution-aware description so the journal/ledger reads correctly
  const description =
    params.resolution === 'loyalty_points'
      ? `Loyalty Points added — ${params.creditNoteNumber}`
      : params.resolution === 'store_credit'
      ? `Store credit issued — ${params.creditNoteNumber}`
      : params.resolution === 'refund'
      ? `Refund — ${params.creditNoteNumber}`
      : `Credit Note ${params.creditNoteNumber}`;

  await postJournalEntry({
    entryDate: params.noteDate,
    description,
    referenceType: 'credit_note',
    referenceId: params.creditNoteId,
    createdBy: params.createdBy,
    lines,
  }, client);
}

// ─── Auto-post: Debit Note (Purchase Return) ─────────────────────────────────

export async function postDebitNote(
  params: {
    debitNoteId: string;
    debitNoteNumber: string;
    noteDate: string;
    grandTotal: number;
    taxableValue: number;
    totalCgst: number;
    totalSgst: number;
    reducesItc: boolean;
    createdBy: string;
  },
  client: PoolClient
): Promise<void> {
  if (params.grandTotal <= 0) return;

  const lines: JournalLine[] = [
    { accountCode: '2001', debit: params.grandTotal, credit: 0 }, // Reduce AP
  ];

  lines.push({ accountCode: '1300', debit: 0, credit: params.taxableValue }); // Reduce Inventory
  if (params.reducesItc) {
    if (params.totalCgst > 0) lines.push({ accountCode: '1200', debit: 0, credit: params.totalCgst });
    if (params.totalSgst > 0) lines.push({ accountCode: '1201', debit: 0, credit: params.totalSgst });
  }

  await postJournalEntry({
    entryDate: params.noteDate,
    description: `Debit Note ${params.debitNoteNumber}`,
    referenceType: 'debit_note',
    referenceId: params.debitNoteId,
    createdBy: params.createdBy,
    lines,
  }, client);
}

// ─── Auto-post: Expense ───────────────────────────────────────────────────────

export async function postExpense(
  params: {
    expenseId: string;
    expenseDate: string;
    description: string;
    amount: number;
    expenseAccountCode: string;
    paymentMode: string;
    createdBy: string;
  },
  client: PoolClient
): Promise<string> {
  const payAcct = params.paymentMode === 'bank' ? '1002' : '1001';
  return postJournalEntry({
    entryDate: params.expenseDate,
    description: params.description,
    referenceType: 'expense',
    referenceId: params.expenseId,
    createdBy: params.createdBy,
    lines: [
      { accountCode: params.expenseAccountCode, debit: params.amount, credit: 0 },
      { accountCode: payAcct, debit: 0, credit: params.amount },
    ],
  }, client);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Account balance query helpers ───────────────────────────────────────────

export interface AccountBalance {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number; // sign-corrected for normal balance
}

export async function getAccountBalances(opts?: {
  fromDate?: string;
  toDate?: string;
  type?: string;
}): Promise<AccountBalance[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.fromDate) { params.push(opts.fromDate); conditions.push(`je.entry_date >= $${params.length}`); }
  if (opts?.toDate) { params.push(opts.toDate); conditions.push(`je.entry_date <= $${params.length}`); }

  const whereJe = conditions.length ? `AND ${conditions.join(' AND ')}` : '';
  const whereType = opts?.type ? `WHERE a.account_type = '${opts.type}'` : '';

  const client = await pool.connect();
  try {
    const res = await client.query<AccountBalance & { total_debit: string; total_credit: string }>(
      `SELECT
         a.id, a.account_code, a.account_name, a.account_type,
         COALESCE(SUM(jl.debit_amount), 0)  AS total_debit,
         COALESCE(SUM(jl.credit_amount), 0) AS total_credit,
         CASE a.account_type
           WHEN 'asset'     THEN COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0)
           WHEN 'expense'   THEN COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0)
           ELSE COALESCE(SUM(jl.credit_amount),0) - COALESCE(SUM(jl.debit_amount),0)
         END AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id ${whereJe}
       ${whereType}
       WHERE a.is_active = TRUE
       GROUP BY a.id, a.account_code, a.account_name, a.account_type
       ORDER BY a.account_code`,
      params
    );
    return res.rows.map((r) => ({
      ...r,
      total_debit: Number(r.total_debit),
      total_credit: Number(r.total_credit),
      balance: Number(r.balance),
    }));
  } finally {
    client.release();
  }
}
