import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const balances = await getAccountBalances({
    fromDate: searchParams.get('from') ?? undefined,
    toDate:   searchParams.get('to')   ?? undefined,
  });

  const headers = ['Account Code', 'Account Name', 'Type', 'Total Debit', 'Total Credit', 'Balance'];
  const csvRows = [
    headers.join(','),
    ...balances.map((a) =>
      [
        a.account_code,
        `"${a.account_name}"`,
        a.account_type,
        a.total_debit.toFixed(2),
        a.total_credit.toFixed(2),
        a.balance.toFixed(2),
      ].join(',')
    ),
  ];

  const from = searchParams.get('from') ?? 'all';
  const to   = searchParams.get('to')   ?? 'dates';

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="TrialBalance_${from}_${to}.csv"`,
    },
  });
}
