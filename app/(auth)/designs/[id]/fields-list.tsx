'use client';

import { useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmForm from '@/components/confirm-form';
import { deleteFieldAction, updateFieldAction, reorderFieldsAction } from '../actions';

interface Field {
  id: string;
  field_name: string;
  field_type: 'number' | 'text';
  unit: string | null;
}

interface Props {
  designId: string;
  fields: Field[];
}

export default function FieldsList({ designId, fields: initialFields }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState(initialFields);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'number' | 'text'>('number');
  const [editUnit, setEditUnit] = useState('');
  const [editError, setEditError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  function startEdit(f: Field) {
    setEditingId(f.id);
    setEditName(f.field_name);
    setEditType(f.field_type);
    setEditUnit(f.unit ?? '');
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  function saveEdit(fieldId: string) {
    if (!editName.trim()) { setEditError('Field name is required'); return; }
    startTrans(async () => {
      const res = await updateFieldAction({
        fieldId, designId, fieldName: editName.trim(), fieldType: editType, unit: editUnit.trim(),
      });
      if (res.error) {
        setEditError(res.error);
      } else {
        setFields((prev) => prev.map((f) =>
          f.id === fieldId ? { ...f, field_name: editName.trim(), field_type: editType, unit: editUnit.trim() || null } : f
        ));
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function persistOrder(next: Field[]) {
    setFields(next);
    startTrans(async () => {
      await reorderFieldsAction(designId, next.map((f) => f.id));
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const from = fields.findIndex((f) => f.id === dragId);
    const to = fields.findIndex((f) => f.id === targetId);
    if (from === -1 || to === -1) { setDragId(null); return; }
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  }

  if (fields.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400">
        No fields yet. Add the first measurement field below.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="w-8 px-2 py-2" />
          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Field Name</th>
          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Unit</th>
          <th className="px-4 py-2 w-40"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {fields.map((f, i) => (
          <tr
            key={f.id}
            className={`hover:bg-gray-50 ${dragId === f.id ? 'opacity-40' : ''}`}
            draggable={editingId !== f.id}
            onDragStart={() => setDragId(f.id)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => handleDrop(f.id)}
            onDragEnd={() => setDragId(null)}
          >
            <td className="px-2 py-2 text-center text-gray-300 cursor-grab select-none" title="Drag to reorder">
              ⠿
            </td>
            {editingId === f.id ? (
              <>
                <td className="px-4 py-2">
                  <input
                    className="input text-sm py-1 w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    className="input text-sm py-1"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'number' | 'text')}
                  >
                    <option value="number">Number</option>
                    <option value="text">Text</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    className="input text-sm py-1 w-20"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    placeholder="cm / in"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => saveEdit(f.id)}
                      className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
                    >
                      {isPending ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
                </td>
              </>
            ) : (
              <>
                <td className="px-4 py-2 font-medium">{f.field_name}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.field_type === 'number'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {f.field_type}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{f.unit || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={i === 0 || isPending}
                      onClick={() => move(i, -1)}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === fields.length - 1 || isPending}
                      onClick={() => move(i, 1)}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => startEdit(f)} className="text-xs text-purple-600 hover:underline">
                      Edit
                    </button>
                    <ConfirmForm
                      action={deleteFieldAction}
                      message={`Delete field "${f.field_name}"? This won't affect saved measurements.`}
                    >
                      <input type="hidden" name="field_id" value={f.id} />
                      <input type="hidden" name="design_id" value={designId} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </ConfirmForm>
                  </div>
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
