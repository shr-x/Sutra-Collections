import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import PayrollClient from './payroll-client';

export const metadata: Metadata = { title: 'Payroll' };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string };
}) {
  await requireRole('admin');

  const now   = new Date();
  const year  = parseInt(searchParams.year  ?? String(now.getFullYear()));
  const month = parseInt(searchParams.month ?? String(now.getMonth() + 1));

  const totalDays = daysInMonth(year, month);

  // Active staff with salary data
  const staffRes = await pool.query<{
    id: string; name: string; email: string; base_salary: number;
  }>(`SELECT id, name, email, COALESCE(base_salary, 0)::numeric AS base_salary
      FROM users WHERE is_active = TRUE ORDER BY name`);

  // Attendance summary for the month
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay  = `${year}-${String(month).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;

  const attRes = await pool.query<{
    user_id: string; present: string; half_days: string; absent: string; leave: string;
  }>(
    `SELECT user_id,
            SUM(CASE WHEN status='present'  THEN 1 ELSE 0 END)::text AS present,
            SUM(CASE WHEN status='half_day' THEN 1 ELSE 0 END)::text AS half_days,
            SUM(CASE WHEN status='absent'   THEN 1 ELSE 0 END)::text AS absent,
            SUM(CASE WHEN status='leave'    THEN 1 ELSE 0 END)::text AS leave
     FROM attendance
     WHERE date BETWEEN $1 AND $2
     GROUP BY user_id`,
    [firstDay, lastDay]
  );

  const attendance = attRes.rows.map((r) => ({
    userId:   r.user_id,
    present:  parseInt(r.present),
    halfDays: parseInt(r.half_days),
    absent:   parseInt(r.absent),
    leave:    parseInt(r.leave),
  }));

  // Existing payroll runs for this month
  const runsRes = await pool.query<{
    user_id: string; month: number; year: number; amount_paid: number; days_present: number;
  }>(
    `SELECT user_id, month, year, amount_paid::numeric AS amount_paid, days_present::numeric AS days_present
     FROM payroll_runs WHERE month=$1 AND year=$2`,
    [month, year]
  );

  const existingRuns = runsRes.rows.map((r) => ({
    userId:      r.user_id,
    month:       r.month,
    year:        r.year,
    amount_paid: Number(r.amount_paid),
    days_present: Number(r.days_present),
  }));

  // Month navigation helpers
  const prevD = new Date(year, month - 2, 1);
  const nextD = new Date(year, month,     1);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="text-sm text-gray-500">Calculate and post salary expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/staff/payroll?month=${prevD.getMonth() + 1}&year=${prevD.getFullYear()}`}
                className="btn-secondary px-3">‹</Link>
          <span className="text-sm font-medium text-gray-700 w-36 text-center">
            {new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <Link href={`/staff/payroll?month=${nextD.getMonth() + 1}&year=${nextD.getFullYear()}`}
                className="btn-secondary px-3">›</Link>
        </div>
      </div>

      <PayrollClient
        staff={staffRes.rows.map((r) => ({ ...r, base_salary: Number(r.base_salary) }))}
        attendance={attendance}
        existingRuns={existingRuns}
        year={year}
        month={month}
        totalDays={totalDays}
      />
    </div>
  );
}
