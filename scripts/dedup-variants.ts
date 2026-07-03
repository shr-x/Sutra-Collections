/**
 * One-time cleanup: merge duplicate size/colour records that share the same
 * case-insensitive name for the same item.
 *
 * Run once against the production DB:
 *   npx tsx scripts/dedup-variants.ts
 *
 * Safe to re-run — it's a no-op when no duplicates exist.
 * Delete this file after confirming the merge is complete.
 */

import pool from '../lib/db';

async function dedup() {
  const client = await pool.connect();
  let sizesMerged = 0;
  let colorsMerged = 0;

  try {
    await client.query('BEGIN');

    // ── Duplicate sizes ───────────────────────────────────────────────────────
    const dupSizes = await client.query<{
      item_id: string;
      size_name: string;
      ids: string[];
    }>(`
      SELECT item_id,
             MIN(size_name) AS size_name,
             ARRAY_AGG(id ORDER BY created_at ASC, id ASC) AS ids
      FROM item_sizes
      GROUP BY item_id, LOWER(TRIM(size_name))
      HAVING COUNT(*) > 1
    `);

    for (const row of dupSizes.rows) {
      const [keepId, ...dropIds] = row.ids;
      console.log(`  sizes: item ${row.item_id} "${row.size_name}" — keeping ${keepId}, removing ${dropIds.join(', ')}`);
      for (const dropId of dropIds) {
        await client.query('UPDATE stock SET size_id=$1 WHERE size_id=$2', [keepId, dropId]);
        await client.query('UPDATE invoice_items SET size_id=$1 WHERE size_id=$2', [keepId, dropId]);
        await client.query('UPDATE purchase_invoice_items SET size_id=$1 WHERE size_id=$2', [keepId, dropId]);
        await client.query('DELETE FROM item_sizes WHERE id=$1', [dropId]);
        sizesMerged++;
      }
    }

    // ── Duplicate colours ─────────────────────────────────────────────────────
    const dupColors = await client.query<{
      item_id: string;
      color_name: string;
      ids: string[];
    }>(`
      SELECT item_id,
             MIN(color_name) AS color_name,
             ARRAY_AGG(id ORDER BY created_at ASC, id ASC) AS ids
      FROM item_colors
      GROUP BY item_id, LOWER(TRIM(color_name))
      HAVING COUNT(*) > 1
    `);

    for (const row of dupColors.rows) {
      const [keepId, ...dropIds] = row.ids;
      console.log(`  colors: item ${row.item_id} "${row.color_name}" — keeping ${keepId}, removing ${dropIds.join(', ')}`);
      for (const dropId of dropIds) {
        await client.query('UPDATE stock SET color_id=$1 WHERE color_id=$2', [keepId, dropId]);
        await client.query('UPDATE invoice_items SET color_id=$1 WHERE color_id=$2', [keepId, dropId]);
        await client.query('UPDATE purchase_invoice_items SET color_id=$1 WHERE color_id=$2', [keepId, dropId]);
        await client.query('DELETE FROM item_colors WHERE id=$1', [dropId]);
        colorsMerged++;
      }
    }

    await client.query('COMMIT');
    if (sizesMerged + colorsMerged === 0) {
      console.log('No duplicates found — nothing to do.');
    } else {
      console.log(`Done: ${sizesMerged} duplicate size(s) merged, ${colorsMerged} duplicate colour(s) merged.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rollback — error during dedup:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

dedup();
