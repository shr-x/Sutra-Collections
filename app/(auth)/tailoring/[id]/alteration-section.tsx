import RequestAlterationButton from './request-alteration-button';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(Math.abs(n))}`;

interface AlterationRow {
  id: string;
  description: string;
  price_adjustment: number;
  requested_at: string;
  requested_by_name: string | null;
}

interface Props {
  orderId: string;
  status: string;
  alterations: AlterationRow[];
}

const ELIGIBLE_STATUSES = ['ready_for_pickup', 'delivered'];

export default function AlterationSection({ orderId, status, alterations }: Props) {
  const canRequest = ELIGIBLE_STATUSES.includes(status);

  if (!canRequest && alterations.length === 0) return null;

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Alterations</h2>
        {canRequest && <RequestAlterationButton orderId={orderId} />}
      </div>

      {alterations.length === 0 ? (
        <p className="text-xs text-gray-400">No alterations requested yet.</p>
      ) : (
        <ul className="space-y-3">
          {alterations.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 whitespace-pre-line">{a.description}</p>
                {a.price_adjustment !== 0 && (
                  <span className={`shrink-0 text-sm font-semibold ${a.price_adjustment > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {a.price_adjustment > 0 ? '+' : '-'}{fmt(a.price_adjustment)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {new Date(a.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {a.requested_by_name ? ` · ${a.requested_by_name}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
