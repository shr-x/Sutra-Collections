'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/confirm-dialog';
import { markDeliveredPaidAction, markDeliveredOnCreditAction } from '../actions';
import EditPriceButton from './edit-price-button';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

interface Props {
  orderId: string;
  balanceDue: number;
  currentTotal: number;
}

export default function DeliveryActions({ orderId, balanceDue, currentTotal }: Props) {
  const router = useRouter();
  const [isPending, startTrans] = useTransition();
  const [confirmCredit, setConfirmCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMarkPaid = balanceDue <= 0;

  function handlePaid() {
    setError(null);
    startTrans(async () => {
      const res = await markDeliveredPaidAction(orderId);
      if (res.success) router.refresh();
      else setError(res.error ?? 'Failed to mark delivered.');
    });
  }

  function handleOnCredit() {
    setConfirmCredit(false);
    setError(null);
    startTrans(async () => {
      const res = await markDeliveredOnCreditAction(orderId);
      if (res.success) router.refresh();
      else setError(res.error ?? 'Failed to mark delivered.');
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <EditPriceButton orderId={orderId} currentTotal={currentTotal} />

      {/* Each delivery action is only rendered when it's actually usable —
          no disabled/grayed buttons cluttering the card. */}
      {canMarkPaid && (
        <button
          type="button"
          onClick={handlePaid}
          disabled={isPending}
          className="btn-primary w-full disabled:opacity-40"
        >
          {isPending ? 'Updating…' : 'Mark Delivered (Paid)'}
        </button>
      )}

      {!canMarkPaid && (
        <button
          type="button"
          onClick={() => setConfirmCredit(true)}
          disabled={isPending}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40"
        >
          {isPending ? 'Updating…' : 'Mark Delivered (On Credit)'}
        </button>
      )}

      <ConfirmDialog
        open={confirmCredit}
        title="Deliver on Credit?"
        message={`This order has a balance of ${fmt(balanceDue)}. Confirming will mark it delivered and add ${fmt(balanceDue)} to this customer's outstanding dues.`}
        confirmLabel="Deliver on Credit"
        onConfirm={handleOnCredit}
        onCancel={() => setConfirmCredit(false)}
      />
    </div>
  );
}
