import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import pool from '@/lib/db';

interface SupplierRow {
  name: string; phone: string; gstin: string; address: string;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const { rows } = await req.json() as { rows: SupplierRow[] };

    let saved = 0, skipped = 0;
    const errors: string[] = [];
    const skippedDetails: string[] = [];

    for (const row of rows) {
      if (!row.name.trim()) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const phone = row.phone.replace(/\D/g, '').slice(-10) || '';
        const gstin = row.gstin.trim() || null;

        // Duplicate check: GSTIN first (#19), then fall back to name.
        const dup = await client.query<{ gstin: string | null }>(
          `SELECT gstin FROM suppliers
           WHERE ($1::text IS NOT NULL AND gstin IS NOT NULL AND UPPER(gstin) = UPPER($1))
              OR LOWER(name) = LOWER($2)
           LIMIT 1`,
          [gstin, row.name.trim()]
        );

        if (dup.rows.length > 0) {
          skipped++;
          // Record why it was skipped for the import summary (#11)
          const matchedGstin = dup.rows[0].gstin;
          skippedDetails.push(
            gstin && matchedGstin && matchedGstin.toUpperCase() === gstin.toUpperCase()
              ? `${row.name.trim()} — already exists (GSTIN: ${matchedGstin})`
              : `${row.name.trim()} — already exists (matched by name)`
          );
          await client.query('ROLLBACK');
          continue;
        }

        await client.query(
          `INSERT INTO suppliers (name, phone, gstin, address)
           VALUES ($1, $2, $3, $4)`,
          [row.name.trim(), phone || 'N/A', gstin, row.address.trim()]
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

    return NextResponse.json({ saved, skipped, errors, skippedDetails });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
