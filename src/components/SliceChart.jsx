import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { compactNum } from './kit';

const SLICE_CAP = 6;

function slicePercent(value, total) {
  if (!(total > 0)) return '0%';
  const pct = (Number(value) || 0) / total * 100;
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/**
 * A ring with the total in the hole and value + percent beside it.
 * More than six slices become a ranked bar with the value at the end.
 */
export function SliceChart({ slices = [], format = compactNum, noun = 'Total' }) {
  const rows = (slices || [])
    .map((s) => ({ ...s, value: Number(s.value) || 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) {
    return <p className="py-8 text-center text-[13px] text-muted">No slices yet</p>;
  }

  if (rows.length > SLICE_CAP) {
    const max = rows[0].value || 1;
    return (
      <div className="flex flex-col gap-2.5">
        <p className="num text-[13px] text-ink">{format(total)} <span className="font-mono text-[10px] text-faint">{noun}</span></p>
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[12px] text-ink sm:w-36">{r.label}</span>
            <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, backgroundColor: r.color || '#94a3b8' }} />
            </div>
            <span className="num shrink-0 text-[12px] text-ink">
              {format(r.value)} <span className="text-faint">{slicePercent(r.value, total)}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
      <div className="relative h-56 w-full md:h-64 md:w-1/2">
        <Doughnut
          data={{
            labels: rows.map((r) => r.label),
            datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r) => r.color || '#94a3b8'), borderWidth: 0 }],
          }}
          options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-[22px] text-ink">{format(total)}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-faint">{noun}</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 md:w-1/2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: r.color || '#94a3b8' }} />
              <span className="truncate text-[13px] text-ink">{r.label}</span>
            </span>
            <span className="num shrink-0 text-[13px] text-ink">
              {format(r.value)} <span className="text-faint">{slicePercent(r.value, total)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
