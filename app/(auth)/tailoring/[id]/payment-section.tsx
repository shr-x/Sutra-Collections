import RecordPaymentButton from './record-payment-button';
import type { TailoringPaymentMode } from '@/types';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

interface PaymentRow {
  id: string;
  amount: number;
  payment_mode: TailoringPaymentMode;
  recorded_at: string;
  recorded_by_name: string | null;
}

interface Props {
  orderId: string;
  totalAmount: number;
  amountPaid: number;
  creditAmount: number;
  payments: PaymentRow[];
}

export default function PaymentSection({ orderId, totalAmount, amountPaid, creditAmount, payments }: Props) {
  const balanceDue = Math.round((totalAmount - amountPaid) * 100) / 100;

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Payment</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Total Amount</span>
          <span className="font-medium">{fmt(totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Amount Paid</span>
          <span className="font-medium text-green-700">{fmt(amountPaid)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="font-semibold text-gray-700">Balance Due</span>
          <span className={`text-base font-bold ${balanceDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
            {balanceDue > 0 ? fmt(balanceDue) : '—'}
          </span>
        </div>
        {creditAmount > 0 && (
          <div className="flex justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
            <span className="text-xs font-medium text-amber-800">On Credit (customer dues)</span>
            <span className="text-sm font-bold text-amber-800">{fmt(creditAmount)}</span>
          </div>
        )}
      </div>

      <RecordPaymentButton orderId={orderId} balanceDue={balanceDue} className="mt-4 w-full rounded-lg border-2 border-dashed border-purple-200 py-2 text-sm font-medium text-purple-600 transition-colors hover:border-purple-400 hover:bg-purple-50" />

      {payments.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Payment History</p>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-gray-700">{fmt(p.amount)}</span>
                  <span className="ml-1.5 uppercase text-gray-400">{p.payment_mode}</span>
                  {p.recorded_by_name && <span className="ml-1.5 text-gray-400">· {p.recorded_by_name}</span>}
                </div>
                <span className="text-gray-400">
                  {new Date(p.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
