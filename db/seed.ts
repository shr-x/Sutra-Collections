import pool from '../lib/db';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  try {
    // Idempotency check — skip if data already exists
    const { rows } = await client.query('SELECT COUNT(*) AS cnt FROM users');
    if (parseInt(rows[0].cnt, 10) > 0) {
      console.log('✓ Database already seeded — skipping');
      return;
    }

    await client.query('BEGIN');

    // ── Warehouse ─────────────────────────────────────────────────────────
    const warehouseRes = await client.query(
      `INSERT INTO warehouses (name, address) VALUES ($1, $2) RETURNING id`,
      ['Main Store', '']
    );
    const warehouseId: string = warehouseRes.rows[0].id;

    // ── Admin user ────────────────────────────────────────────────────────
    // ⚠ CHANGE THIS PASSWORD ON FIRST LOGIN via Admin → Settings → My Account
    const passwordHash = await bcrypt.hash('admin123', 12);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, warehouse_id)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Admin', 'admin@sutra.local', passwordHash, 'admin', warehouseId]
    );

    // ── Sample item categories (GST slabs for textile) ────────────────────
    // HSN codes follow minimum 4-digit rule (CLAUDE.md business rule #6)
    await client.query(`
      INSERT INTO items (name, hsn_code, item_type, gst_rate, unit) VALUES
        ('Cotton Fabric',           '5208', 'raw_material', 5,  'metre'),
        ('Silk Fabric',             '5007', 'raw_material', 5,  'metre'),
        ('Polyester Blend',         '5512', 'raw_material', 12, 'metre'),
        ('Lace & Trimmings',        '5810', 'raw_material', 12, 'metre'),
        ('Cotton Saree',            '5208', 'finished',     5,  'pcs'),
        ('Silk Saree',              '5007', 'finished',     5,  'pcs'),
        ('Cotton Kurta',            '6211', 'finished',     5,  'pcs'),
        ('Embroidered Dupatta',     '6214', 'finished',     5,  'pcs'),
        ('Dress Material Set',      '6211', 'finished',     5,  'set'),
        ('Blouse Piece',            '5007', 'finished',     5,  'pcs'),
        ('Synthetic Saree',         '5516', 'finished',     12, 'pcs'),
        ('Embroidered Lehenga Set', '6211', 'finished',     12, 'set')
    `);

    await client.query('COMMIT');
    console.log('✓ Seed complete');
    console.log('  Admin: admin@sutra.local / admin123');
    console.log('  ⚠  Change the admin password on first login!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
