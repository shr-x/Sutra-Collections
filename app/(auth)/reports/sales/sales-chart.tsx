'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface DayRow {
  day: string;
  count: number;
  total: string;
}

interface Props {
  data: DayRow[];
}

function formatDDMMM(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatInrShort(val: number): string {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val.toLocaleString('en-IN')}`;
}

interface TooltipPayload {
  value: number;
  payload: { day: string; total: string };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-purple-700 font-bold">
        {Number(row.payload.total).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

export default function SalesChart({ data }: Props) {
  const chartData = data.map((r) => ({
    label: formatDDMMM(r.day),
    day: r.day,
    total: Number(r.total),
    count: r.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        margin={{ top: 10, right: 10, bottom: 60, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#9CA3AF', fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          interval={0}
          height={60}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatInrShort(v)}
          tick={{ fill: '#9CA3AF', fontSize: 11 }}
          width={50}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total" fill="#7C3AED" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
