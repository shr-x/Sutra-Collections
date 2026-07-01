'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { saveBusinessSettingsAction, type BusinessFormState } from './actions';

interface Props {
  defaults: Record<string, string>;
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Save Settings'}
    </button>
  );
}

const INITIAL: BusinessFormState = {};

export default function BusinessForm({ defaults }: Props) {
  const router = useRouter();
  const [state, formAction] = useFormState(saveBusinessSettingsAction, INITIAL);

  // Re-fetch server props (including new logo path) after a successful save
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Settings saved successfully.
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Business Details</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input
              type="text"
              name="company_name"
              defaultValue={defaults.company_name ?? ''}
              className="input w-full"
              placeholder="Sutra Collections"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
            <input
              type="text"
              name="company_gstin"
              defaultValue={defaults.company_gstin ?? ''}
              className="input w-full font-mono uppercase"
              placeholder="29AABCU9603R1ZJ"
              maxLength={15}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea
            name="company_address"
            defaultValue={defaults.company_address ?? ''}
            rows={3}
            className="input w-full"
            placeholder="Shop No. 12, MG Road, Bengaluru – 560001"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              name="company_state"
              defaultValue={defaults.company_state ?? ''}
              className="input w-full"
              placeholder="Karnataka"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State Code</label>
            <input
              type="text"
              name="company_state_code"
              defaultValue={defaults.company_state_code ?? ''}
              className="input w-full"
              placeholder="29"
              maxLength={2}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Contact</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              name="company_phone"
              defaultValue={defaults.company_phone ?? ''}
              className="input w-full"
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="company_email"
              defaultValue={defaults.company_email ?? ''}
              className="input w-full"
              placeholder="contact@sutracollections.in"
            />
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Payments &amp; Logo</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">UPI VPA</label>
          <input
            type="text"
            name="upi_vpa"
            defaultValue={defaults.upi_vpa ?? ''}
            className="input w-full font-mono"
            placeholder="sutracollections@upi"
          />
          <p className="mt-1 text-xs text-gray-400">
            Used to auto-generate a UPI QR code on every invoice PDF.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Logo</label>
          {defaults.company_logo_path && (
            <div className="mb-2">
              {/* ?v= busts the browser cache when the same filename is re-uploaded */}
              <img
                src={`/${defaults.company_logo_path}?v=${encodeURIComponent(defaults.company_logo_path)}`}
                alt="Current logo"
                className="h-16 w-auto rounded border border-gray-200 object-contain"
              />
              <p className="mt-1 text-xs text-gray-400">Current logo (upload a new file to replace)</p>
            </div>
          )}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
          />
          <p className="mt-1 text-xs text-gray-400">PNG, JPG, GIF or WebP · Max 2 MB · Shown in sidebar &amp; PDFs</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Loyalty Points</h2>
        <p className="text-xs text-gray-500">
          Customers earn points on paid invoices. Points can be redeemed at billing.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Earn Rate <span className="font-normal text-gray-400">(points per ₹100 spent)</span>
            </label>
            <input
              type="number"
              name="loyalty_earn_rate"
              defaultValue={defaults.loyalty_earn_rate ?? '1'}
              min="0"
              step="0.5"
              className="input w-full"
              placeholder="1"
            />
            <p className="mt-1 text-xs text-gray-400">e.g. 1 = 1 point for every ₹100 paid</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Redemption Rate <span className="font-normal text-gray-400">(points per ₹1 discount)</span>
            </label>
            <input
              type="number"
              name="loyalty_redemption_rate"
              defaultValue={defaults.loyalty_redemption_rate ?? '10'}
              min="1"
              step="1"
              className="input w-full"
              placeholder="10"
            />
            <p className="mt-1 text-xs text-gray-400">e.g. 10 = 10 points gives ₹1 off</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitBtn />
      </div>
    </form>
  );
}
