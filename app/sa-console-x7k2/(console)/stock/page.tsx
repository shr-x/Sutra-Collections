import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import StockAdjustForm from './_form';

interface Item {
  id: string;
  name: string;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
}

export default async function StockAdjustPage({
  searchParams,
}: {
  searchParams: { adjusted?: string };
}) {
  await requireSA();

  const [itemsRes, warehousesRes] = await Promise.all([
    query<Item>(`SELECT id, name, unit FROM items WHERE is_active = TRUE ORDER BY name`),
    query<Warehouse>(`SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name`),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-white">Stock Adjustment</h1>
      <p className="text-sm text-gray-500">
        Directly add or remove stock from any item/warehouse. Use negative quantities to remove.
      </p>

      {searchParams.adjusted === '1' && (
        <div className="rounded border border-green-700 bg-green-900/30 px-4 py-3 text-sm text-green-300">
          Stock adjustment recorded successfully.
        </div>
      )}

      <StockAdjustForm items={itemsRes.rows} warehouses={warehousesRes.rows} />
    </div>
  );
}
