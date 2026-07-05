import { requireAuth } from '@/lib/auth';
import { query } from '@/lib/db';
import MobileNav from '@/components/mobile-nav';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  const [{ rows }, userRows] = await Promise.all([
    query(`SELECT key, value FROM settings WHERE key IN ('company_name', 'company_logo_path', 'staff_module_enabled')`),
    query<{ name: string }>(`SELECT name FROM users WHERE id=$1`, [session.userId]),
  ]);
  const settings          = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const companyName       = settings.company_name || undefined;
  const logoPath          = settings.company_logo_path || undefined;
  const staffModuleEnabled = settings.staff_module_enabled === 'true';
  const liveUserName      = userRows.rows[0]?.name ?? session.email;

  return (
    <MobileNav
      role={session.role}
      userName={liveUserName}
      companyName={companyName}
      logoPath={logoPath}
      staffModuleEnabled={staffModuleEnabled}
    >
      {children}
    </MobileNav>
  );
}
