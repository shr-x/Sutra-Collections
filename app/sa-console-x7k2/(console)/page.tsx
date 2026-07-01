import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';

interface DashboardStats {
  userCount: string;
  invoiceCount: string;
}

interface UpdateLog {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  git_before: string | null;
  git_after: string | null;
  error_msg: string | null;
}

export default async function SADashboardPage() {
  await requireSA();

  const [statsRes, lastLogRes] = await Promise.all([
    query<DashboardStats>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS "userCount",
        (SELECT COUNT(*)::text FROM invoices) AS "invoiceCount"
    `),
    query<UpdateLog>(`
      SELECT id, status, started_at, completed_at, git_before, git_after, error_msg
      FROM sa_update_log
      ORDER BY started_at DESC
      LIMIT 1
    `),
  ]);

  const stats = statsRes.rows[0] ?? { userCount: '0', invoiceCount: '0' };
  const lastLog = lastLogRes.rows[0] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Regular Users', value: stats.userCount },
          { label: 'Total Invoices', value: stats.invoiceCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Last update log */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-300">Last System Update</h2>
        {lastLog ? (
          <table className="w-full text-xs text-gray-400">
            <tbody className="divide-y divide-gray-700">
              <tr>
                <td className="py-1.5 pr-4 text-gray-500">Status</td>
                <td>
                  <StatusBadge status={lastLog.status} />
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 text-gray-500">Started</td>
                <td>{new Date(lastLog.started_at).toLocaleString('en-IN')}</td>
              </tr>
              {lastLog.completed_at && (
                <tr>
                  <td className="py-1.5 pr-4 text-gray-500">Completed</td>
                  <td>{new Date(lastLog.completed_at).toLocaleString('en-IN')}</td>
                </tr>
              )}
              {lastLog.git_before && (
                <tr>
                  <td className="py-1.5 pr-4 text-gray-500">Git</td>
                  <td>
                    {lastLog.git_before}
                    {lastLog.git_after ? ` → ${lastLog.git_after}` : ''}
                  </td>
                </tr>
              )}
              {lastLog.error_msg && (
                <tr>
                  <td className="py-1.5 pr-4 align-top text-gray-500">Error</td>
                  <td className="py-1.5 text-red-400">{lastLog.error_msg}</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-600">No updates have been run yet.</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    running: 'bg-yellow-900 text-yellow-300',
    success: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
    rolled_back: 'bg-purple-900 text-purple-300',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colours[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  );
}
