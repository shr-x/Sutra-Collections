/**
 * SA Console root layout — completely isolated HTML shell.
 * No auth check here; auth is enforced inside the (console) route group.
 * Dark theme to visually distinguish from the regular app.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Console',
  robots: { index: false, follow: false },
};

export default function SAConsoleRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-gray-100 min-h-screen antialiased">{children}</body>
    </html>
  );
}
