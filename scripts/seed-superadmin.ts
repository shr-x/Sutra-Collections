/**
 * Seed (or update) the super-admin account.
 *
 * Run with:
 *   npx ts-node scripts/seed-superadmin.ts
 * Or inside Docker:
 *   docker compose exec web npx ts-node scripts/seed-superadmin.ts
 *
 * Override defaults via env vars:
 *   SA_USERNAME=superadmin SA_PASSWORD=ChangeMe@2024! npx ts-node scripts/seed-superadmin.ts
 */
import { query } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const username = process.env.SA_USERNAME || 'superadmin';
  const password = process.env.SA_PASSWORD || 'ChangeMe@2024!';
  const hash = await bcrypt.hash(password, 12);

  await query(
    `INSERT INTO super_admins (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username, hash]
  );

  console.log(`Super admin '${username}' seeded successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
