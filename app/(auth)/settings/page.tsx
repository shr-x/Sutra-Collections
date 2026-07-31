import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  togglePurchaseOrdersAction,
  saveWhatsAppSettingsAction,
  saveLowStockThresholdAction,
  toggleStaffModuleAction,
} from './actions';
import StoreSection from './store-section';
import ModuleToggle from './module-toggle';
import SettingsFormSection from '@/components/settings-form-section';
import TourSettingsSection from '@/components/tour/tour-settings-section';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireRole('admin');

  const { rows } = await query<{ key: string; value: string }>(
    `SELECT key, value FROM settings
     WHERE key IN (
       'purchase_orders_enabled','reminder_days_before','overdue_reminder_interval',
       'admin_whatsapp','low_stock_threshold','staff_module_enabled',
       'company_name','company_gstin','company_address','company_phone',
       'company_email','upi_vpa','company_logo_path',
       'company_state','company_state_code',
       'loyalty_earn_rate','loyalty_redemption_rate',
       'shop_anniversary_date','terms_and_conditions'
     )`
  );
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const poEnabled          = settings.purchase_orders_enabled === 'true';
  const staffModEnabled    = settings.staff_module_enabled === 'true';
  const reminderDaysBefore = settings.reminder_days_before ?? '3';
  const adminWhatsapp      = settings.admin_whatsapp ?? '';
  const lowStockThreshold  = settings.low_stock_threshold ?? '5';

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none';

  return (
    <div className="w-full">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your store configuration</p>
      </div>

      {/* ── Section 1: Store (full width) ────────────────────────────────────── */}
      <div data-tour="settings-store" className="rounded-xl bg-white shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">🏪</span>
          <div>
            <h2 className="font-bold text-base text-gray-900">Store</h2>
            <p className="text-xs text-gray-500">Business info, branding and payment</p>
          </div>
        </div>
        <StoreSection defaults={settings} />
      </div>

      {/* ── Row 2: Inventory + WhatsApp (two columns) ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Inventory */}
        <div className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-2xl">📦</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">Inventory</h2>
              <p className="text-xs text-gray-500">Stock thresholds applied across all items</p>
            </div>
          </div>
          <SettingsFormSection action={saveLowStockThresholdAction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Low Stock Alert Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="low_stock_threshold"
                  defaultValue={lowStockThreshold}
                  min={0}
                  placeholder="e.g. 5"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
                <span className="text-xs text-gray-400">units</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">Alert when stock falls at or below this number</p>
            </div>
          </SettingsFormSection>
        </div>

        {/* WhatsApp & Notifications */}
        <div data-tour="settings-whatsapp" className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-2xl">💬</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">WhatsApp &amp; Notifications</h2>
              <p className="text-xs text-gray-500">Admin contact and reminder cadence</p>
            </div>
          </div>
          <SettingsFormSection action={saveWhatsAppSettingsAction} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admin WhatsApp Number
              </label>
              <input
                type="tel"
                name="admin_whatsapp"
                defaultValue={adminWhatsapp}
                placeholder="919XXXXXXXXX"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">Include country code, e.g. 919876543210</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Reminder Days Before Due
              </label>
              <input
                type="number"
                name="reminder_days_before"
                defaultValue={reminderDaysBefore}
                min={0}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
            </div>
          </SettingsFormSection>
        </div>
      </div>

      {/* ── Row 3: Modules + Purchase Orders (two columns) ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Modules */}
        <div data-tour="settings-modules" className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-2xl">🔔</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">Modules</h2>
              <p className="text-xs text-gray-500">Enable or disable optional modules</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-4">
            <div>
              <p className="font-medium text-gray-900">Staff Module</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Attendance, payroll and performance
              </p>
            </div>
            <ModuleToggle
              enabled={staffModEnabled}
              name="staff_module_enabled"
              action={toggleStaffModuleAction}
            />
          </div>
        </div>

        {/* Purchase Orders */}
        <div className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-2xl">🛒</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">Purchase Orders</h2>
              <p className="text-xs text-gray-500">
                PO → GRN → Invoice workflow (off by default)
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-4">
            <div>
              <p className="font-medium text-gray-900">Enable PO Flow</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Default is direct Purchase Invoice
              </p>
            </div>
            <ModuleToggle
              enabled={poEnabled}
              name="purchase_orders_enabled"
              action={togglePurchaseOrdersAction}
            />
          </div>
        </div>
      </div>

      {/* ── Navigation cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Staff & Access */}
        <div className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">Staff &amp; Access</h2>
              <p className="text-xs text-gray-500">Users, roles, and warehouses</p>
            </div>
          </div>
          <div className="space-y-2">
            <Link
              href="/settings/users"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors border border-gray-100"
            >
              Users <span className="text-gray-400">→</span>
            </Link>
            <Link
              href="/settings/warehouses"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors border border-gray-100"
            >
              Warehouses <span className="text-gray-400">→</span>
            </Link>
          </div>
        </div>

        {/* Discount Schemes */}
        <div className="rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🎁</span>
            <div>
              <h2 className="font-bold text-base text-gray-900">Discount Schemes</h2>
              <p className="text-xs text-gray-500">Buy-X-Get-Y, seasonal promotions</p>
            </div>
          </div>
          <Link
            href="/settings/schemes"
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors border border-gray-100"
          >
            Manage Schemes <span className="text-gray-400">→</span>
          </Link>
        </div>
      </div>

      {/* ── Help & Onboarding ───────────────────────────────────────────────── */}
      <TourSettingsSection />
    </div>
  );
}
