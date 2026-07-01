import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(
  req: NextRequest,
  { params }: { params: { type: string } }
) {
  const session = await requireRole('admin', 'accountant');
  const isAdmin = session.role === 'admin';
  const format = req.nextUrl.searchParams.get('format'); // 'json' or null (CSV)

  let data: string[][];
  let filename: string;
  // For JSON format, we build an array of objects from raw rows
  let jsonRows: Record<string, unknown>[] = [];

  switch (params.type) {
    case 'customers': {
      const res = await query(
        `SELECT c.name, c.phone, c.address, c.gstin,
                c.credit_limit, c.loyalty_points_balance,
                c.date_of_birth,
                c.whatsapp_opt_out, c.created_at
         FROM customers c WHERE c.is_active=TRUE AND c.deleted_at IS NULL ORDER BY c.name`
      );
      jsonRows = res.rows.map((r) => ({
        name: r.name, phone: r.phone ?? '', address: r.address ?? '', gstin: r.gstin ?? '',
        credit_limit: r.credit_limit, loyalty_points: r.loyalty_points_balance,
        dob: r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString('en-IN') : '',
        wa_opt_out: r.whatsapp_opt_out, created: new Date(r.created_at).toLocaleDateString('en-IN'),
      }));
      data = [
        ['Name','Phone','Address','GSTIN','Credit Limit','Loyalty Points','DOB','WA Opt-out','Created'],
        ...res.rows.map((r) => [
          r.name, r.phone ?? '', r.address ?? '', r.gstin ?? '',
          r.credit_limit, r.loyalty_points_balance,
          r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString('en-IN') : '',
          r.whatsapp_opt_out ? 'Yes' : 'No',
          new Date(r.created_at).toLocaleDateString('en-IN'),
        ]),
      ];
      filename = 'customers';
      break;
    }

    case 'suppliers': {
      const res = await query(
        `SELECT s.name, s.phone, s.email, s.address, s.gstin, s.created_at
         FROM suppliers s ORDER BY s.name`
      );
      jsonRows = res.rows.map((r) => ({ name: r.name, phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '', gstin: r.gstin ?? '', created: new Date(r.created_at).toLocaleDateString('en-IN') }));
      data = [
        ['Name','Phone','Email','Address','GSTIN','Created'],
        ...res.rows.map((r) => [r.name, r.phone ?? '', r.email ?? '', r.address ?? '', r.gstin ?? '', new Date(r.created_at).toLocaleDateString('en-IN')]),
      ];
      filename = 'suppliers';
      break;
    }

    case 'items': {
      const res = await query(
        `SELECT i.name, i.category, i.item_type, i.unit, i.hsn_code,
                i.gst_rate, i.is_active,
                COALESCE(SUM(st.quantity),0) AS total_stock
         FROM items i
         LEFT JOIN stock st ON st.item_id=i.id
         GROUP BY i.id ORDER BY i.name`
      );
      jsonRows = res.rows.map((r) => ({ name: r.name, category: r.category ?? '', type: r.item_type, unit: r.unit ?? '', hsn: r.hsn_code ?? '', gst_rate: r.gst_rate, active: r.is_active, total_stock: r.total_stock }));
      data = [
        ['Name','Category','Type','Unit','HSN','GST%','Active','Total Stock'],
        ...res.rows.map((r) => [
          r.name, r.category ?? '', r.item_type, r.unit ?? '',
          r.hsn_code ?? '', r.gst_rate, r.is_active ? 'Yes' : 'No', r.total_stock,
        ]),
      ];
      filename = 'items';
      break;
    }

    case 'invoices': {
      const res = await query(
        `SELECT i.invoice_number, i.invoice_date, i.status,
                COALESCE(c.name,'Walk-in') AS customer,
                i.payment_mode, i.grand_total, i.amount_paid,
                i.total_cgst, i.total_sgst, i.invoice_discount_amount
         FROM invoices i
         LEFT JOIN customers c ON c.id=i.customer_id
         ORDER BY i.invoice_date DESC, i.invoice_number`
      );
      jsonRows = res.rows.map((r) => ({ invoice_number: r.invoice_number, date: r.invoice_date, status: r.status, customer: r.customer, payment_mode: r.payment_mode ?? '', grand_total: r.grand_total, amount_paid: r.amount_paid, cgst: r.total_cgst, sgst: r.total_sgst, discount: r.invoice_discount_amount }));
      data = [
        ['Invoice No.','Date','Status','Customer','Mode','Grand Total','Paid','CGST','SGST','Discount'],
        ...res.rows.map((r) => [
          r.invoice_number, r.invoice_date, r.status, r.customer,
          r.payment_mode ?? '', r.grand_total, r.amount_paid,
          r.total_cgst, r.total_sgst, r.invoice_discount_amount,
        ]),
      ];
      filename = 'invoices';
      break;
    }

    case 'purchases': {
      if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const res = await query(
        `SELECT p.invoice_number, p.invoice_date, p.status,
                COALESCE(s.name,'—') AS supplier,
                p.payment_mode, p.grand_total, p.amount_paid
         FROM purchase_invoices p
         LEFT JOIN suppliers s ON s.id=p.supplier_id
         ORDER BY p.invoice_date DESC`
      );
      jsonRows = res.rows.map((r) => ({ invoice_number: r.invoice_number ?? '', date: r.invoice_date, status: r.status, supplier: r.supplier, payment_mode: r.payment_mode ?? '', grand_total: r.grand_total, amount_paid: r.amount_paid }));
      data = [
        ['Invoice No.','Date','Status','Supplier','Mode','Grand Total','Paid'],
        ...res.rows.map((r) => [
          r.invoice_number ?? '', r.invoice_date, r.status, r.supplier,
          r.payment_mode ?? '', r.grand_total, r.amount_paid,
        ]),
      ];
      filename = 'purchases';
      break;
    }

    case 'tailoring-orders': {
      const res = await query(
        `SELECT o.order_number, o.stage, o.price, o.due_date,
                c.name AS customer, c.phone,
                d.name AS design, d.category,
                o.color_fabric, o.notes, o.created_at
         FROM tailoring_orders o
         JOIN customers c ON c.id=o.customer_id
         JOIN designs   d ON d.id=o.design_id
         ORDER BY o.created_at DESC`
      );
      jsonRows = res.rows.map((r) => ({ order_number: r.order_number, stage: r.stage, price: r.price, due_date: r.due_date ? new Date(r.due_date).toLocaleDateString('en-IN') : '', customer: r.customer, phone: r.phone ?? '', design: r.design, category: r.category ?? '', color_fabric: r.color_fabric ?? '', notes: r.notes ?? '', created: new Date(r.created_at).toLocaleDateString('en-IN') }));
      data = [
        ['Order No.','Stage','Price','Due Date','Customer','Phone','Design','Category','Color/Fabric','Notes','Created'],
        ...res.rows.map((r) => [
          r.order_number, r.stage, r.price,
          r.due_date ? new Date(r.due_date).toLocaleDateString('en-IN') : '',
          r.customer, r.phone ?? '', r.design, r.category ?? '',
          r.color_fabric ?? '', r.notes ?? '',
          new Date(r.created_at).toLocaleDateString('en-IN'),
        ]),
      ];
      filename = 'tailoring-orders';
      break;
    }

    case 'journal': {
      if (!isAdmin && session.role !== 'accountant') return NextResponse.json({ error: 'Accountant or Admin only' }, { status: 403 });
      const from = req.nextUrl.searchParams.get('from');
      const to   = req.nextUrl.searchParams.get('to');
      const jConds: string[] = [];
      const jParams: unknown[] = [];
      if (from) { jParams.push(from); jConds.push(`je.entry_date >= $${jParams.length}`); }
      if (to)   { jParams.push(to);   jConds.push(`je.entry_date <= $${jParams.length}`); }
      const jWhere = jConds.length ? `WHERE ${jConds.join(' AND ')}` : '';
      const res = await query(
        `SELECT je.entry_date, je.description, je.reference_type, je.is_manual,
                COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
                je.created_at
         FROM journal_entries je
         LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
         ${jWhere}
         GROUP BY je.id
         ORDER BY je.entry_date DESC, je.created_at DESC
         LIMIT 2000`,
        jParams
      );
      jsonRows = res.rows.map((r) => ({
        date: r.entry_date, description: r.description,
        type: r.is_manual ? 'Manual' : (r.reference_type ?? 'Auto'),
        amount: Number(r.total_debit),
        created_at: r.created_at,
      }));
      data = [
        ['Date', 'Description', 'Type', 'Amount', 'Created At'],
        ...res.rows.map((r) => [
          r.entry_date, r.description,
          r.is_manual ? 'Manual' : (r.reference_type ?? 'Auto'),
          Number(r.total_debit).toFixed(2),
          new Date(r.created_at).toLocaleDateString('en-IN'),
        ]),
      ];
      filename = 'journal-entries';
      break;
    }

    case 'audit-log': {
      if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
      const from = req.nextUrl.searchParams.get('from');
      const to   = req.nextUrl.searchParams.get('to');
      const conditions: string[] = [];
      const auditParams: unknown[] = [];
      if (from && to) {
        auditParams.push(from, to);
        conditions.push(`al.created_at::date BETWEEN $1 AND $2`);
      }
      const userId = req.nextUrl.searchParams.get('user_id');
      if (userId) { auditParams.push(userId); conditions.push(`al.user_id=$${auditParams.length}`); }
      const action = req.nextUrl.searchParams.get('action');
      if (action) { auditParams.push(action); conditions.push(`al.action=$${auditParams.length}`); }
      const entity = req.nextUrl.searchParams.get('entity');
      if (entity) { auditParams.push(entity); conditions.push(`al.entity_type=$${auditParams.length}`); }
      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const res = await query(
        `SELECT al.action, al.entity_type, al.entity_id, al.entity_label,
                al.old_value, al.new_value, al.created_at,
                u.name AS user_name
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
         ORDER BY al.created_at DESC LIMIT 5000`,
        auditParams
      );
      jsonRows = res.rows.map((r) => ({
        when: r.created_at, user: r.user_name ?? '', action: r.action,
        entity_type: r.entity_type, entity_id: r.entity_id,
        entity_label: r.entity_label ?? '',
        old_value: r.old_value ?? null, new_value: r.new_value ?? null,
      }));
      data = [
        ['When','User','Action','Entity Type','Entity ID','Label','Old Value','New Value'],
        ...res.rows.map((r) => [
          new Date(r.created_at).toLocaleString('en-IN'), r.user_name ?? '',
          r.action, r.entity_type, r.entity_id, r.entity_label ?? '',
          r.old_value ?? '', r.new_value ?? '',
        ]),
      ];
      filename = 'audit-log';
      break;
    }

    default:
      return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  }

  if (format === 'json') {
    return new NextResponse(JSON.stringify(jsonRows, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    });
  }

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  });
}
