'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateDesignAction, type DesignState } from '../../actions';

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

interface Props {
  design: { id: string; name: string; category: string | null; description: string | null; photo_path: string | null };
}

export default function EditDesignForm({ design }: Props) {
  const [state, formAction] = useFormState<DesignState, FormData>(updateDesignAction, {});

  return (
    <form action={formAction} encType="multipart/form-data" className="card space-y-4">
      <input type="hidden" name="id" value={design.id} />

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Design Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          required
          defaultValue={design.name}
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <input
          type="text"
          name="category"
          defaultValue={design.category ?? ''}
          className="input w-full"
          placeholder="e.g. Kurta, Blouse, Lehenga…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={design.description ?? ''}
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Replace Photo</label>
        {design.photo_path && (
          <img
            src={`/${design.photo_path}`}
            alt="Current"
            className="mb-2 h-24 w-24 rounded-lg object-cover border border-gray-200"
          />
        )}
        <input
          type="file"
          name="photo"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
        />
        <p className="mt-1 text-xs text-gray-400">Leave blank to keep existing photo</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <a href={`/designs/${design.id}`} className="btn-secondary">Cancel</a>
        <SubmitBtn />
      </div>
    </form>
  );
}
