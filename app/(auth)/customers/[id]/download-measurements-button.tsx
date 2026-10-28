'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/confirm-dialog';

// Confirm-then-download, mirroring the per-version thermal download on the
// tailoring order page.
export default function DownloadMeasurementsButton({
  customerId,
  designCount,
}: {
  customerId: string;
  designCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        Download measurements
      </button>
      <ConfirmDialog
        open={open}
        title="Download Measurements"
        message={`Generate a thermal receipt with the latest measurements for ${designCount} design${designCount !== 1 ? 's' : ''}?`}
        confirmLabel="Download"
        onConfirm={() => {
          setOpen(false);
          window.open(`/api/customers/${customerId}/measurements/thermal`, '_blank');
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
