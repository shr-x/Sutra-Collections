import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import AttendanceCalendar from './attendance-calendar';

export const metadata: Metadata = { title: 'Attendance' };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { user?: string; month?: string; year?: string };
}) {
  const session = await requireRole('admin');

  const now   = new Date();
  const year  = parseInt(searchParams.year  ?? String(now.getFullYear()));
  const month = parseInt(searchParams.month ?? String(now.getMonth() + 1));

  // Load staff list
  let staffList: { id: string; name: string }[];
  if (session.role === 'admin') {
    const res = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE is_active = TRUE ORDER BY name`
    );
    staffList = res.rows;
  } else {
    staffList = [{ id: session.userId, name: session.name }];
  }

  // Resolve which user's attendance to show
  const selectedUserId =
    searchParams.user && staffList.some((u) => u.id === searchParams.user)
      ? searchParams.user
      : (staffList[0]?.id ?? session.userId);

  // Build all calendar days for the month
  const totalDays = daysInMonth(year, month);
  const allDates: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    allDates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Load attendance records for this user/month
  const attRes = await pool.query<{ date: string; status: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, status
     FROM attendance
     WHERE user_id = $1
       AND date >= $2::date
       AND date <= $3::date`,
    [selectedUserId, allDates[0], allDates[allDates.length - 1]]
  );

  const attMap: Record<string, string> = {};
  for (const row of attRes.rows) attMap[row.date] = row.status;

  const days = allDates.map((date) => ({
    date,
    status: (attMap[date] as 'present' | 'absent' | 'half_day' | 'leave' | null) ?? null,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="text-sm text-gray-500">Mark and review daily attendance</p>
        </div>
      </div>

      <AttendanceCalendar
        staffList={staffList}
        days={days}
        selectedUserId={selectedUserId}
        currentUserId={session.userId}
        role={session.role}
        year={year}
        month={month}
      />
    </div>
  );
}
