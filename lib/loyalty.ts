import { pool, query } from '@/lib/db';
import type { PoolClient } from 'pg';

export interface LoyaltyRates {
  earnRate: number;         // points per ₹100 spent
  redemptionRate: number;   // points per ₹1 discount
}

export async function getLoyaltyRates(): Promise<LoyaltyRates> {
  const res = await query(
    `SELECT key, value FROM settings WHERE key IN ('loyalty_earn_rate','loyalty_redemption_rate')`
  );
  const map: Record<string, string> = Object.fromEntries(res.rows.map((r) => [r.key, r.value]));
  return {
    earnRate:        parseFloat(map.loyalty_earn_rate ?? '1') || 1,
    redemptionRate:  parseFloat(map.loyalty_redemption_rate ?? '1') || 1,
  };
}

/** Earn points for a paid invoice — call AFTER the transaction commits. */
export async function earnPoints(
  customerId: string,
  grandTotal: number,
  referenceId: string,
  earnRate: number
): Promise<void> {
  const points = Math.floor((grandTotal / 100) * earnRate);
  if (points <= 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE customers SET loyalty_points_balance = loyalty_points_balance + $1 WHERE id=$2`,
      [points, customerId]
    );
    await client.query(
      `INSERT INTO loyalty_transactions (customer_id, points, type, reference_id, reference_type)
       VALUES ($1,$2,'earned',$3,'invoice')`,
      [customerId, points, referenceId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[earnPoints]', err);
  } finally {
    client.release();
  }
}

/** Redeem points — call INSIDE an existing transaction. */
export async function redeemPointsInTransaction(
  client: PoolClient,
  customerId: string,
  pointsToRedeem: number,
  referenceId: string
): Promise<void> {
  if (pointsToRedeem <= 0) return;
  await client.query(
    `UPDATE customers SET loyalty_points_balance = GREATEST(0, loyalty_points_balance - $1) WHERE id=$2`,
    [pointsToRedeem, customerId]
  );
  await client.query(
    `INSERT INTO loyalty_transactions (customer_id, points, type, reference_id, reference_type)
     VALUES ($1,$2,'redeemed',$3,'invoice')`,
    [customerId, -pointsToRedeem, referenceId]
  );
}
