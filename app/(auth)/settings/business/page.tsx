import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import BusinessForm from './business-form';

export const metadata: Metadata = { title: 'Business Profile' };

const SETTING_KEYS = [
  'company_name', 'company_gstin', 'company_address', 'company_state',
  'company_state_code', 'company_phone', 'company_email', 'upi_vpa',
  'company_logo_path', 'loyalty_earn_rate', 'loyalty_redemption_rate',
];

export default async function BusinessProfilePage() {
  await requireRole('admin');

  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [SETTING_KEYS]
  );
  const defaults = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/settings" className="hover:text-gray-600">Settings</Link>
            {' / '}
            <span className="text-gray-700">Business Profile</span>
          </nav>
          <h1 className="page-title">Business Profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Company name, GSTIN, address, UPI VPA, and logo used across PDFs and the sidebar.
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <BusinessForm defaults={defaults} />
      </div>
    </div>
  );
}
