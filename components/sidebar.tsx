'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { logoutAction } from '@/app/login/actions';
import type { Role } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string }[];
}

const BILLING_CHILDREN = [
  { href: '/billing/invoices',    label: 'Invoices' },
  { href: '/billing/credit-notes', label: 'Refunds' },
  { href: '/billing/purchases',   label: 'Purchases' },
  { href: '/billing/debit-notes', label: 'Debit Notes' },
];

const BILLING_CHILDREN_STAFF = [
  { href: '/billing/invoices',    label: 'Invoices' },
  { href: '/billing/credit-notes', label: 'Refunds' },
];

const TAILORING_CHILDREN_STAFF = [
  { href: '/tailoring', label: 'Orders' },
];

const ACCOUNTING_CHILDREN = [
  { href: '/accounting/journal',       label: 'Journal' },
  { href: '/accounting/ledger',        label: 'Ledger' },
  { href: '/accounting/trial-balance', label: 'Trial Balance' },
  { href: '/accounting/profit-loss',   label: 'P&L Statement' },
  { href: '/accounting/balance-sheet', label: 'Balance Sheet' },
  { href: '/accounting/expenses',      label: 'Expenses' },
  { href: '/accounting/gst/gstr1',     label: 'GSTR-1' },
  { href: '/accounting/gst/gstr3b',    label: 'GSTR-3B' },
  { href: '/accounting/gst/hsn',       label: 'HSN Summary' },
];

const CUSTOMERS_CHILDREN = [
  { href: '/customers',      label: 'All Customers' },
  { href: '/customers/dues', label: 'Outstanding Dues' },
];

const TAILORING_CHILDREN = [
  { href: '/tailoring',            label: 'Orders' },
  { href: '/tailoring/production', label: 'Production Board' },
  { href: '/designs',              label: 'Design Catalog' },
  { href: '/tailoring/tailors',    label: 'Tailors' },
];

const STAFF_CHILDREN_ADMIN = [
  { href: '/staff/attendance', label: 'Attendance' },
  { href: '/staff/payroll',    label: 'Payroll' },
];

const REPORTS_CHILDREN_ADMIN = [
  { href: '/reports/daybook',      label: 'Daybook' },
  { href: '/reports/sales',        label: 'Sales' },
  { href: '/reports/purchases',    label: 'Purchases' },
  { href: '/reports/best-sellers', label: 'Best Sellers' },
  { href: '/reports/staff',        label: 'Staff Performance' },
  { href: '/reports/audit',        label: 'Audit Log' },
  { href: '/reports/export',       label: 'Export Data' },
];

const REPORTS_CHILDREN_STAFF = [
  { href: '/reports/daybook',      label: 'Daybook' },
  { href: '/reports/sales',        label: 'Sales' },
  { href: '/reports/best-sellers', label: 'Best Sellers' },
  { href: '/reports/export',       label: 'Export Data' },
];

const REPORTS_CHILDREN_ACCOUNTANT = [
  { href: '/reports/daybook',      label: 'Daybook' },
  { href: '/reports/sales',        label: 'Sales' },
  { href: '/reports/purchases',    label: 'Purchases' },
  { href: '/reports/best-sellers', label: 'Best Sellers' },
  { href: '/reports/export',       label: 'Export Data' },
];

const NAV_ITEMS: Record<Role, NavItem[]> = {
  admin: [
    { href: '/dashboard',  label: 'Dashboard',  icon: '⊞' },
    { href: '/billing',    label: 'Billing',    icon: '🧾', children: BILLING_CHILDREN },
    { href: '/customers',  label: 'Customers',  icon: '👥', children: CUSTOMERS_CHILDREN },
    { href: '/suppliers',  label: 'Suppliers',  icon: '🏭' },
    { href: '/inventory',  label: 'Inventory',  icon: '📦' },
    { href: '/accounting', label: 'Accounting', icon: '📒', children: ACCOUNTING_CHILDREN },
    { href: '/tailoring',  label: 'Tailoring',  icon: '✂️', children: TAILORING_CHILDREN },
    { href: '/staff',      label: 'Staff',      icon: '👤', children: STAFF_CHILDREN_ADMIN },
    { href: '/reports',    label: 'Reports',    icon: '📊', children: REPORTS_CHILDREN_ADMIN },
    { href: '/settings',   label: 'Settings',   icon: '⚙️' },
  ],
  staff: [
    { href: '/billing',   label: 'Billing',   icon: '🧾', children: BILLING_CHILDREN_STAFF },
    { href: '/tailoring', label: 'Tailoring', icon: '✂️', children: TAILORING_CHILDREN_STAFF },
  ],
  accountant: [
    { href: '/accounting', label: 'Accounting', icon: '📒', children: ACCOUNTING_CHILDREN },
    { href: '/reports',    label: 'Reports',    icon: '📊', children: REPORTS_CHILDREN_ACCOUNTANT },
  ],
};

interface Props {
  role: Role;
  userName: string;
  companyName?: string;
  logoPath?: string;
  staffModuleEnabled?: boolean;
  onNavClick?: () => void;
  isMobileDrawer?: boolean;
}

export default function Sidebar({ role, userName, companyName, logoPath, staffModuleEnabled = false, onNavClick, isMobileDrawer = false }: Props) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS[role];
  const displayName = companyName || 'Sutra Collections';
  const initial = displayName.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showLogo = !!logoPath && !imgError;

  // Accordion state — used only when isMobileDrawer is true.
  // Initialise to the currently-active top-level section so it auto-expands on open.
  const activeSection: string | null =
    navItems.find((item) => item.children?.some((c) => pathname.startsWith(c.href)))?.href ?? null;
  const [openSection, setOpenSection] = useState<string | null>(activeSection);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-gray-200 bg-white shadow-sm">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-4">
        {showLogo ? (
          // Plain img — avoids next/image optimizer quirks for local volume-mounted files
          <img
            src={`/${logoPath}`}
            alt={displayName}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-700 text-sm font-bold text-white">
            {initial}
          </div>
        )}
        <span className="text-sm font-bold text-gray-900 leading-tight truncate">
          {displayName}
        </span>
      </div>

      {/* Navigation — min-h-0 lets this flex child scroll instead of growing
          and pushing the Sign out block off-screen (#2). */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const childActive = item.children?.some((c) => pathname.startsWith(c.href));
          // Staff link is disabled when staff module is not enabled
          const isStaffItem = item.href === '/staff' || item.href === '/staff/attendance';
          const isDisabled = isStaffItem && !staffModuleEnabled;

          // ── Accordion mode (mobile drawer only) ──────────────────────────
          if (isMobileDrawer) {
            if (isDisabled) {
              return (
                <div key={item.href}>
                  <span
                    title="Staff module is disabled. Enable in Settings."
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 cursor-not-allowed pointer-events-none select-none"
                  >
                    <span className="text-base opacity-40">{item.icon}</span>
                    {item.label}
                  </span>
                </div>
              );
            }

            if (item.children) {
              const isOpen = openSection === item.href;
              return (
                <div key={item.href}>
                  {/* Section header — toggles open/closed, does NOT navigate */}
                  <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? null : item.href)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      childActive
                        ? 'text-purple-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? (
                      <svg className="h-4 w-4 shrink-0 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                  {/* Sub-items — always visible when section is open */}
                  {isOpen && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.children.map((child) => {
                        const selfMatches = pathname === child.href || pathname.startsWith(child.href + '/');
                        const siblingIsMoreSpecific = item.children!.some(
                          (s) => s.href !== child.href && (pathname === s.href || pathname.startsWith(s.href + '/')) && s.href.length > child.href.length
                        );
                        const childIsActive = selfMatches && !siblingIsMoreSpecific;
                        const childDisabled = child.href === '/reports/staff' && !staffModuleEnabled;
                        if (childDisabled) {
                          return (
                            <span
                              key={child.href}
                              title="Staff module is disabled. Enable in Settings."
                              className="block rounded-md px-3 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed select-none"
                            >
                              {child.label}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavClick}
                            className={`block rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              childIsActive
                                ? 'text-purple-700 bg-purple-50'
                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // No children — direct link that closes drawer on click
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavClick}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </div>
            );
          }

          // ── Desktop mode (unchanged) ──────────────────────────────────────
          return (
            <div key={item.href}>
              {isDisabled ? (
                <span
                  title="Staff module is disabled. Enable in Settings."
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 cursor-not-allowed pointer-events-none select-none"
                >
                  <span className="text-base opacity-40">{item.icon}</span>
                  {item.label}
                </span>
              ) : (
                <>
                  <Link
                    href={item.href}
                    onClick={onNavClick}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active || childActive
                        ? 'bg-purple-50 text-purple-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                  {item.children && (active || childActive) && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.children.map((child) => {
                        // Longest-match: only the most specific sibling is active.
                        const selfMatches = pathname === child.href || pathname.startsWith(child.href + '/');
                        const siblingIsMoreSpecific = item.children!.some(
                          (s) => s.href !== child.href && (pathname === s.href || pathname.startsWith(s.href + '/')) && s.href.length > child.href.length
                        );
                        const childIsActive = selfMatches && !siblingIsMoreSpecific;
                        const childDisabled = child.href === '/reports/staff' && !staffModuleEnabled;
                        if (childDisabled) {
                          return (
                            <span
                              key={child.href}
                              title="Staff module is disabled. Enable in Settings."
                              className="block rounded-md px-3 py-1.5 text-xs font-medium text-gray-300 cursor-not-allowed select-none"
                            >
                              {child.label}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavClick}
                            className={`block rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              childIsActive
                                ? 'text-purple-700 bg-purple-50'
                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/* User info + logout — always pinned to the bottom */}
      <div className="shrink-0 border-t border-gray-200 px-3 py-3">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          {/* Avatar circle with initials */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-700 text-xs font-bold text-white uppercase">
            {userName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800">{userName}</p>
            <p className="text-xs capitalize text-gray-400">{role}</p>
          </div>
        </div>
        <form action={logoutAction} className="mt-1">
          <button
            type="submit"
            onClick={onNavClick}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            {/* Logout icon */}
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
