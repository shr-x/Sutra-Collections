'use client';

import { useState } from 'react';
import Sidebar from './sidebar';
import GlobalSearch from './global-search';
import type { Role } from '@/types';

interface Props {
  role: Role;
  userName: string;
  companyName?: string;
  logoPath?: string;
  staffModuleEnabled?: boolean;
  children: React.ReactNode;
}

export default function MobileNav({
  role,
  userName,
  companyName,
  logoPath,
  staffModuleEnabled,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile overlay — tapping it closes the drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar: off-canvas on mobile, always visible on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-56 transform transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          role={role}
          userName={userName}
          companyName={companyName}
          logoPath={logoPath}
          staffModuleEnabled={staffModuleEnabled}
          onNavClick={() => setDrawerOpen(false)}
          isMobileDrawer={true}
        />
      </div>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
          {/* Hamburger — only visible on mobile */}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <GlobalSearch />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
