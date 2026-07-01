import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';

interface InboxRow {
  id: string;
  received_at: string;
  from_phone: string;
  customer_name: string | null;
  message_type: string;
  message_text: string | null;
  processed: boolean;
}

interface SearchParams { from?: string; to?: string; processed?: string }

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSA();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (searchParams.from) {
    params.push(searchParams.from);
    conditions.push(`w.received_at::date >= $${params.length}`);
  }
  if (searchParams.to) {
    params.push(searchParams.to);
    conditions.push(`w.received_at::date <= $${params.length}`);
  }
  if (searchParams.processed === 'yes') {
    conditions.push('w.processed = TRUE');
  } else if (searchParams.processed === 'no') {
    conditions.push('w.processed = FALSE');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query<InboxRow>(
    `SELECT w.id, w.received_at, w.from_phone, w.message_type, w.message_text, w.processed,
            c.name AS customer_name
     FROM whatsapp_incoming_messages w
     LEFT JOIN customers c ON c.id = w.customer_id
     ${where}
     ORDER BY w.received_at DESC
     LIMIT 500`,
    params
  );

  const rows = res.rows;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-white">WhatsApp Inbox</h1>

      {/* Filters */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
        <div>
          <label className="mb-1 block text-xs text-gray-400">From date</label>
          <input
            type="date"
            name="from"
            defaultValue={searchParams.from ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">To date</label>
          <input
            type="date"
            name="to"
            defaultValue={searchParams.to ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Processed</label>
          <select
            name="processed"
            defaultValue={searchParams.processed ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="no">Unprocessed</option>
            <option value="yes">Processed</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Filter
          </button>
          <Link
            href="/sa-console-x7k2/whatsapp-inbox"
            className="rounded border border-gray-600 px-4 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            Clear
          </Link>
        </div>
      </form>

      <p className="mb-3 text-xs text-gray-500">{rows.length} message{rows.length !== 1 ? 's' : ''}</p>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full">
          <thead className="bg-gray-700/50">
            <tr>
              {['Received', 'From', 'Customer', 'Type', 'Message', 'Status', ''].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No messages found.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                  {new Date(row.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-300">{row.from_phone}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-300">
                  {row.customer_name ?? <span className="text-gray-600">Unknown</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{row.message_type}</td>
                <td className="max-w-xs px-4 py-3 text-sm text-gray-300">
                  <span className="line-clamp-2 block max-w-xs break-words">
                    {row.message_text ?? <span className="text-gray-600 italic">non-text</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.processed ? (
                    <span className="rounded-full bg-green-900/60 px-2 py-0.5 text-xs text-green-400">Processed</span>
                  ) : (
                    <span className="rounded-full bg-yellow-900/60 px-2 py-0.5 text-xs text-yellow-400">Pending</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {!row.processed && (
                    <MarkProcessedForm id={row.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkProcessedForm({ id }: { id: string }) {
  async function markProcessed(formData: FormData) {
    'use server';
    const { requireSA: reqSA } = await import('@/lib/sa-auth');
    const { query: dbQuery } = await import('@/lib/db');
    const { revalidatePath } = await import('next/cache');
    await reqSA();
    const msgId = formData.get('id') as string;
    await dbQuery('UPDATE whatsapp_incoming_messages SET processed=TRUE WHERE id=$1', [msgId]);
    revalidatePath('/sa-console-x7k2/whatsapp-inbox');
  }

  return (
    <form action={markProcessed}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-green-600 hover:text-green-400"
      >
        Mark done
      </button>
    </form>
  );
}
