import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditInvoiceForm from './_edit-form';

interface InvoiceEditData {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  payment_mode: string | null;
  grand_total: string;
  amount_paid: string;
  notes: string | null;
}

interface Props {
  params: { id: string };
}

export default async function EditInvoicePage({ params }: Props) {
  await requireSA();

  const res = await query<InvoiceEditData>(
    `SELECT id, invoice_number, invoice_date, status, payment_mode,
            grand_total::text, amount_paid::text, notes
     FROM invoices WHERE id = $1`,
    [params.id]
  );

  const invoice = res.rows[0];
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit Invoice</h1>
        <Link
          href={`/sa-console-x7k2/invoices/${params.id}`}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back to Invoice
        </Link>
      </div>
      <EditInvoiceForm invoice={invoice} />
    </div>
  );
}
