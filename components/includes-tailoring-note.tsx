// Small label for totals that mix retail and tailoring. Tailoring is
// record-keeping only — zero tax and outside accounting (lib/accounting-scope.ts).
export default function IncludesTailoringNote({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 ${className}`}>
      Includes tailoring (not in accounting)
    </span>
  );
}
