'use client';

interface Props {
  formAction: (formData: FormData) => void | Promise<void>;
  label?: string;
  confirmMessage?: string;
}

export default function DeleteButton({
  formAction,
  label = 'Delete',
  confirmMessage = 'Are you sure? This cannot be undone.',
}: Props) {
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
      >
        {label}
      </button>
    </form>
  );
}
