import { requireSA } from '@/lib/sa-auth';
import Link from 'next/link';
import { saLogoutAction } from '@/app/sa-console-x7k2/login/actions';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    links: [
      { href: '/sa-console-x7k2', label: 'Dashboard' },
    ],
  },
  {
    label: 'Data',
    links: [
      { href: '/sa-console-x7k2/customers', label: 'Customers' },
      { href: '/sa-console-x7k2/suppliers', label: 'Suppliers' },
      { href: '/sa-console-x7k2/items', label: 'Items / Products' },
      { href: '/sa-console-x7k2/invoices', label: 'Invoices' },
      { href: '/sa-console-x7k2/purchases', label: 'Purchases' },
      { href: '/sa-console-x7k2/tailoring', label: 'Tailoring Orders' },
      { href: '/sa-console-x7k2/expenses', label: 'Expenses' },
      { href: '/sa-console-x7k2/whatsapp-inbox', label: 'WhatsApp Inbox' },
    ],
  },
  {
    label: 'Inventory',
    links: [
      { href: '/sa-console-x7k2/stock', label: 'Stock Adjustment' },
      { href: '/sa-console-x7k2/stock-history', label: 'Stock History' },
    ],
  },
  {
    label: 'Configuration',
    links: [
      { href: '/sa-console-x7k2/settings', label: 'Settings Override' },
      { href: '/sa-console-x7k2/schemes', label: 'Discount Schemes' },
      { href: '/sa-console-x7k2/users', label: 'Users' },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/sa-console-x7k2/update', label: 'Update System' },
      { href: '/sa-console-x7k2/change-password', label: 'Change Password' },
    ],
  },
];

export default async function SAConsoleLayout({ children }: { children: React.ReactNode }) {
  const sa = await requireSA();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-gray-700 bg-gray-800">
        <div className="border-b border-gray-700 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">SA Console</p>
          <p className="mt-0.5 text-xs text-gray-500">Sutra Collections</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="px-3 py-1 text-xs uppercase tracking-widest text-gray-600">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block rounded px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-700 px-4 py-4">
          <p className="mb-2 truncate text-xs text-gray-500">{sa.saUsername}</p>
          <form action={saLogoutAction}>
            <button
              type="submit"
              className="w-full rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:border-red-700 hover:text-red-400"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-900 p-6">{children}</main>
    </div>
  );
}
