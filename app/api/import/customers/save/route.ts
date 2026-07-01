import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import pool from '@/lib/db';

interface CustomerRow {
  name: string; phone: string; gstin: string; address: string; credit_limit: string;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const { rows } = await req.json() as { rows: CustomerRow[] };

    let saved = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.name.trim()) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Match by phone if provided, else by name
        const phone = row.phone.replace(/\D/g, '').slice(-10) || null;
        const dup = phone
          ? await client.query(`SELECT id FROM customers WHERE phone=$1 LIMIT 1`, [phone])
          : await client.query(`SELECT id FROM customers WHERE LOWER(name)=LOWER($1) LIMIT 1`, [row.name.trim()]);

        if (dup.rows.length > 0) {
          skipped++;
          await client.query('ROLLBACK');
          continue;
        }

        const gstin = row.gstin.trim() || null;
        const creditLimit = Math.max(0, parseFloat(row.credit_limit) || 0);

        await client.query(
          `INSERT INTO customers (name, phone, gstin, address, credit_limit)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.name.trim(), phone, gstin, row.address.trim(), creditLimit]
        );

        await client.query('COMMIT');
        saved++;
      } catch (err) {
        await client.query('ROLLBACK');
        errors.push(`${row.name}: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ saved, skipped, errors });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
