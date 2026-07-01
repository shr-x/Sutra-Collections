'use client';

import { useState, useRef } from 'react';

interface Props {
  itemId: string;
  currentPhotoUrl: string | null;
}

export default function ItemPhotoUploader({ itemId, currentPhotoUrl }: Props) {
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await fetch(`/api/items/${itemId}/photo`, { method: 'POST', body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) {
        setError(json.error || 'Upload failed');
      } else {
        setPhotoUrl(json.url ?? null);
        setImgError(false);
      }
    } catch {
      setError('Upload failed — try again');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="card mb-4">
      <h3 className="mb-3 font-semibold text-gray-900">Item Photo</h3>
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
          {photoUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Item"
              className="h-24 w-24 object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-3xl text-gray-300">🧵</span>
          )}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm"
          >
            {uploading ? 'Uploading…' : photoUrl && !imgError ? 'Change Photo' : 'Upload Photo'}
          </button>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <p className="mt-1 text-xs text-gray-400">JPG, PNG, WebP — max 5 MB</p>
        </div>
      </div>
    </div>
  );
}
