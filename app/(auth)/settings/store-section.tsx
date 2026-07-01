'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { saveBusinessSettingsAction, type BusinessFormState } from './business/actions';

interface Props {
  defaults: Record<string, string>;
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save Store Settings'}
    </button>
  );
}

const INITIAL: BusinessFormState = {};

export default function StoreSection({ defaults }: Props) {
  const router = useRouter();
  const [state, formAction] = useFormState(saveBusinessSettingsAction, INITIAL);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none';

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-4">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Store settings saved successfully.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
        <input
          type="text"
          name="company_name"
          defaultValue={defaults.company_name ?? ''}
          placeholder="Sutra Collections"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
        <input
          type="text"
          name="company_gstin"
          defaultValue={defaults.company_gstin ?? ''}
          placeholder="29AABCU9603R1ZJ"
          maxLength={15}
          className={inputCls + ' font-mono uppercase'}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <textarea
          name="company_address"
          defaultValue={defaults.company_address ?? ''}
          rows={3}
          placeholder="Shop No. 12, MG Road, Bengaluru – 560001"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input
          type="tel"
          name="company_phone"
          defaultValue={defaults.company_phone ?? ''}
          placeholder="+91 98765 43210"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">UPI VPA</label>
        <input
          type="text"
          name="upi_vpa"
          defaultValue={defaults.upi_vpa ?? ''}
          placeholder="sutracollections@upi"
          className={inputCls + ' font-mono'}
        />
        <p className="mt-1 text-xs text-gray-400">Used to generate QR codes on invoices</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Shop Anniversary Date</label>
        <input
          type="date"
          name="shop_anniversary_date"
          defaultValue={defaults.shop_anniversary_date ?? ''}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-gray-400">On this date every year, a greeting is sent to all active customers via WhatsApp</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
        {defaults.company_logo_path && (
          <div className="mb-2">
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
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
        />
        <p className="mt-1 text-xs text-gray-400">PNG, JPG, GIF or WebP · Max 2 MB</p>
      </div>

      <div className="flex justify-end pt-2">
        <SubmitBtn />
      </div>
    </form>
  );
}
