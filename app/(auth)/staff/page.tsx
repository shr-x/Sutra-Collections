import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage() {
  await requireRole('admin');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Staff</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Link
          href="/staff/attendance"
          className="card flex items-start gap-3 hover:shadow-md hover:border-purple-200 transition-all group"
        >
          <span className="text-2xl mt-0.5 shrink-0">📅</span>
          <div>
            <h2 className="font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">
              Attendance
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Mark daily attendance, view monthly calendar
            </p>
          </div>
        </Link>

        <Link
          href="/staff/payroll"
          className="card flex items-start gap-3 hover:shadow-md hover:border-purple-200 transition-all group"
        >
          <span className="text-2xl mt-0.5 shrink-0">💰</span>
          <div>
            <h2 className="font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">
              Payroll
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Monthly pay runs, base salary management
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
