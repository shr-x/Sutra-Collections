'use server';

import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// ── Design CRUD ────────────────────────────────────────────────────────────

const DesignSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(255),
  category:    z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  gst_rate:    z.coerce.number().refine((v) => [0, 5, 12, 18, 28].includes(v), 'GST rate must be 0, 5, 12, 18 or 28%').default(5),
});

export interface DesignState { error?: string }

export async function createDesignAction(
  _prev: DesignState,
  formData: FormData
): Promise<DesignState> {
  const session = await requireRole('admin');

  const parsed = DesignSchema.safeParse({
    name:        formData.get('name'),
    category:    formData.get('category') || undefined,
    description: formData.get('description') || undefined,
    gst_rate:    formData.get('gst_rate') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Generate ID up front so we can name the photo file after it
  const id = crypto.randomUUID();

  let photoPath: string | null = null;
  const photo = formData.get('photo') as File | null;
  if (photo && photo.size > 0) {
    if (photo.size > 5 * 1024 * 1024) return { error: 'Photo must be under 5 MB.' };
    const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
      return { error: 'Photo must be PNG, JPG, GIF or WebP.' };
    const dir = path.join(process.cwd(), 'public', 'uploads', 'designs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(await photo.arrayBuffer());
    fs.writeFileSync(path.join(dir, `${id}.${ext}`), buf);
    photoPath = `uploads/designs/${id}.${ext}`;
  }

  await query(
    `INSERT INTO designs (id, name, category, photo_path, description, gst_rate, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, parsed.data.name, parsed.data.category ?? null,
     photoPath, parsed.data.description ?? null, parsed.data.gst_rate, session.userId]
  );

  redirect(`/designs/${id}`);
}

export async function updateDesignAction(
  _prev: DesignState,
  formData: FormData
): Promise<DesignState> {
  await requireRole('admin');

  const id = formData.get('id') as string;
  const parsed = DesignSchema.safeParse({
    name:        formData.get('name'),
    category:    formData.get('category') || undefined,
    description: formData.get('description') || undefined,
    gst_rate:    formData.get('gst_rate') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let photoUpdate = '';
  const photoParams: unknown[] = [parsed.data.name, parsed.data.category ?? null, parsed.data.description ?? null, parsed.data.gst_rate, id];

  const photo = formData.get('photo') as File | null;
  if (photo && photo.size > 0) {
    if (photo.size > 5 * 1024 * 1024) return { error: 'Photo must be under 5 MB.' };
    const ext = photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
      return { error: 'Photo must be PNG, JPG, GIF or WebP.' };
    const dir = path.join(process.cwd(), 'public', 'uploads', 'designs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.from(await photo.arrayBuffer());
    fs.writeFileSync(path.join(dir, `${id}.${ext}`), buf);
    const newPhotoPath = `uploads/designs/${id}.${ext}`;
    photoParams.splice(4, 0, newPhotoPath);  // insert before id → [name, cat, desc, gst_rate, photoPath, id]
    photoUpdate = ', photo_path=$5';          // $5=photoPath, $6=id
  }

  await query(
    `UPDATE designs SET name=$1, category=$2, description=$3, gst_rate=$4${photoUpdate} WHERE id=$${photoParams.length}`,
    photoParams
  );

  revalidatePath(`/designs/${id}`);
  revalidatePath('/designs');
  redirect(`/designs/${id}`);
}

export async function deleteDesignAction(formData: FormData) {
  await requireRole('admin');
  const id = formData.get('id') as string;
  await query('DELETE FROM designs WHERE id=$1', [id]);
  revalidatePath('/designs');
  redirect('/designs');
}

// ── Measurement Fields ─────────────────────────────────────────────────────

const FieldSchema = z.object({
  design_id:  z.string().uuid(),
  field_name: z.string().min(1).max(100),
  field_type: z.enum(['number', 'text']),
  unit:       z.string().max(20).optional(),
});

export interface FieldState { error?: string }

export async function addFieldAction(
  _prev: FieldState,
  formData: FormData
): Promise<FieldState> {
  await requireRole('admin');

  const parsed = FieldSchema.safeParse({
    design_id:  formData.get('design_id'),
    field_name: formData.get('field_name'),
    field_type: formData.get('field_type'),
    unit:       formData.get('unit') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { rows } = await query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM design_measurement_fields WHERE design_id=$1`,
    [parsed.data.design_id]
  );

  await query(
    `INSERT INTO design_measurement_fields (design_id, field_name, field_type, unit, sort_order)
     VALUES ($1,$2,$3,$4,$5)`,
    [parsed.data.design_id, parsed.data.field_name,
     parsed.data.field_type, parsed.data.unit ?? null, rows[0].next_order]
  );

  revalidatePath(`/designs/${parsed.data.design_id}`);
  return {};
}

export async function deleteFieldAction(formData: FormData) {
  await requireRole('admin');
  const fieldId  = formData.get('field_id') as string;
  const designId = formData.get('design_id') as string;
  await query('DELETE FROM design_measurement_fields WHERE id=$1', [fieldId]);
  revalidatePath(`/designs/${designId}`);
}

export async function updateFieldAction(data: {
  fieldId: string;
  designId: string;
  fieldName: string;
  fieldType: 'number' | 'text';
  unit: string;
}): Promise<FieldState> {
  await requireRole('admin');

  const parsed = FieldSchema.omit({ design_id: true }).safeParse({
    field_name: data.fieldName,
    field_type: data.fieldType,
    unit: data.unit || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  await query(
    `UPDATE design_measurement_fields SET field_name=$1, field_type=$2, unit=$3 WHERE id=$4`,
    [parsed.data.field_name, parsed.data.field_type, parsed.data.unit ?? null, data.fieldId]
  );

  revalidatePath(`/designs/${data.designId}`);
  return {};
}

export async function reorderFieldsAction(
  designId: string,
  orderedFieldIds: string[]
): Promise<{ success: boolean; error?: string }> {
  await requireRole('admin');

  try {
    for (let i = 0; i < orderedFieldIds.length; i++) {
      await query(
        `UPDATE design_measurement_fields SET sort_order=$1 WHERE id=$2 AND design_id=$3`,
        [i, orderedFieldIds[i], designId]
      );
    }
    revalidatePath(`/designs/${designId}`);
    return { success: true };
  } catch (err) {
    console.error('[reorderFieldsAction]', err);
    return { success: false, error: 'Failed to save order.' };
  }
}
