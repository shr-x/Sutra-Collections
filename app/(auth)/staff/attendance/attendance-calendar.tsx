'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave';

interface DayEntry {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus | null;
}

interface StaffUser {
  id: string;
  name: string;
}

interface Props {
  staffList:      StaffUser[];
  days:           DayEntry[];
  selectedUserId: string;
  currentUserId:  string;
  role:           string;
  year:           number;
  month:          number;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string }> = {
  present:  { label: 'P',    color: 'text-green-700',  bg: 'bg-green-100 hover:bg-green-200 border-green-300'   },
  half_day: { label: 'H',    color: 'text-amber-700',  bg: 'bg-amber-100 hover:bg-amber-200 border-amber-300'   },
  leave:    { label: 'L',    color: 'text-blue-700',   bg: 'bg-blue-100  hover:bg-blue-200  border-blue-300'    },
  absent:   { label: 'A',    color: 'text-red-700',    bg: 'bg-red-100   hover:bg-red-200   border-red-300'     },
};

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function AttendanceCalendar({
  staffList, days, selectedUserId, currentUserId, role, year, month,
}: Props) {
  const router  = useRouter();
  const [map, setMap]       = useState<Record<string, AttendanceStatus | null>>(
    Object.fromEntries(days.map((d) => [d.date, d.status]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  // Prev / next month navigation
  const gotoMonth = (m: number, y: number) => {
    const params = new URLSearchParams({ user: selectedUserId, month: String(m), year: String(y) });
    router.push(`/staff/attendance?${params.toString()}`);
  };

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    gotoMonth(d.getMonth() + 1, d.getFullYear());
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    gotoMonth(d.getMonth() + 1, d.getFullYear());
  };

  const changeUser = (userId: string) => {
    const params = new URLSearchParams({ user: userId, month: String(month), year: String(year) });
    router.push(`/staff/attendance?${params.toString()}`);
  };

  const handleMark = async (date: string, status: AttendanceStatus | null) => {
    const prev = map[date];
    setMap((m) => ({ ...m, [date]: status }));
    setErrors((e) => { const n = { ...e }; delete n[date]; return n; });

    try {
      const res = await fetch(status ? '/api/attendance' : '/api/attendance', {
        method: status ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, date, status }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setMap((m) => ({ ...m, [date]: prev }));
      setErrors((e) => ({ ...e, [date]: 'Save failed' }));
    }
  };

  const cycleStatus = (date: string) => {
    const order: (AttendanceStatus | null)[] = ['present', 'half_day', 'leave', 'absent', null];
    const cur = map[date];
    const nextStatus = order[(order.indexOf(cur) + 1) % order.length];
    startTransition(() => { void handleMark(date, nextStatus); });
  };

  // Summary
  const present  = Object.values(map).filter((s) => s === 'present').length;
  const halfDays = Object.values(map).filter((s) => s === 'half_day').length;
  const leaves   = Object.values(map).filter((s) => s === 'leave').length;
  const absent   = Object.values(map).filter((s) => s === 'absent').length;

  const canEdit = role === 'admin' || selectedUserId === currentUserId;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Staff selector — admin only */}
        {role === 'admin' && staffList.length > 1 && (
          <select
            value={selectedUserId}
            onChange={(e) => changeUser(e.target.value)}
            className="input w-52"
          >
            {staffList.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}

        {/* Month navigation */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={prevMonth} className="btn-secondary px-3">‹</button>
          <span className="text-sm font-semibold text-gray-700 w-36 text-center">
            {new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="btn-secondary px-3">›</button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'Present',  value: present,            color: 'bg-green-100 text-green-700' },
          { label: 'Half Day', value: halfDays,           color: 'bg-amber-100 text-amber-700' },
          { label: 'Leave',    value: leaves,             color: 'bg-blue-100 text-blue-700'   },
          { label: 'Absent',   value: absent,             color: 'bg-red-100 text-red-700'     },
          { label: 'Effective', value: `${present + halfDays * 0.5}d`, color: 'bg-purple-100 text-purple-700' },
        ].map((s) => (
          <span key={s.label} className={`rounded-full px-3 py-1 font-medium ${s.color}`}>
            {s.value} {s.label}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="font-medium text-gray-500">Click a day to mark:</span>
        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([k, v]) => (
          <span key={k} className={`rounded px-2 py-0.5 border font-medium ${v.bg} ${v.color}`}>
            {v.label} = {k.replace('_', ' ')}
          </span>
        ))}
        <span className="rounded px-2 py-0.5 border border-gray-200 text-gray-400">— = clear</span>
      </div>

      {/* Calendar grid */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left w-16">Day</th>
              <th className="px-3 py-2.5 text-left">Date</th>
              <th className="px-3 py-2.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {days.map(({ date }) => {
              const d    = new Date(date + 'T00:00:00');
              const status = map[date];
              const cfg    = status ? STATUS_CONFIG[status] : null;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

              return (
                <tr key={date} className={`group ${isWeekend ? 'bg-gray-50/50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-2 text-xs text-gray-400 font-medium">
                    {DAY_NAMES[d.getDay()]}
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-700">
                    {d.getDate()}
                  </td>
                  <td className="px-3 py-2">
                    {errors[date] && (
                      <span className="text-xs text-red-500 mr-2">{errors[date]}</span>
                    )}
                    {canEdit ? (
                      <button
                        onClick={() => cycleStatus(date)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold border transition-all ${
                          cfg
                            ? `${cfg.bg} ${cfg.color}`
                            : 'border-gray-200 text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        {cfg ? `${cfg.label} — ${date.split('-')[2] && status!.replace('_', ' ')}` : '—  Unmark'}
                      </button>
                    ) : cfg ? (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
                        {status!.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
