import { downloadCsv } from '../lib/csv';

export function CsvButton({ filename, rows, label = 'CSV' }) {
  return (
    <button
      type="button"
      data-share-omit
      onClick={() => downloadCsv(filename, rows)}
      className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-faint hover:text-ink"
    >
      {label}
    </button>
  );
}
