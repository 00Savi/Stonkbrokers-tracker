import React, { useMemo, useState } from 'react';
import { compactUsd } from './kit';
import { ChartPanel } from './HistoryCharts';
import {
  heaviestWeekday,
  monthCells,
  monthsIn,
  payoutDays,
  weekdayRollup,
} from '../lib/payoutCalendar';

function tierChipLabel(tier) {
  if (!tier) return '';
  return tier.name ? `${tier.tier}: ${tier.name}` : tier.tier;
}

function monthTitle(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function tone(seat, max) {
  if (!(seat > 0) || !(max > 0)) return 'transparent';
  const t = Math.max(0.18, Math.min(1, seat / max));
  return `rgba(0, 168, 4, ${0.15 + t * 0.75})`;
}

export function PayoutCalendar({ project }) {
  const tiers = (project?.tiers || []).filter((tier) => tier?.tier);
  const [tierId, setTierId] = useState(tiers[0]?.tier || '');
  const tier = tiers.find((row) => row.tier === tierId) || tiers[0];
  const days = useMemo(() => payoutDays(project, tier), [project, tier]);
  const months = useMemo(() => monthsIn(days), [days]);
  const [monthKey, setMonthKey] = useState(null);
  const [picked, setPicked] = useState(null);

  const activeMonth = months.find((row) => row.key === monthKey) || months[months.length - 1];
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const cells = activeMonth ? monthCells(activeMonth.year, activeMonth.month, byDate) : [];
  const monthMax = cells.reduce((max, cell) => Math.max(max, cell?.row?.seat || 0), 0);
  const rollup = useMemo(() => weekdayRollup(days), [days]);
  const heavy = heaviestWeekday(rollup);
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0].map((dow) => rollup[dow]);
  const open = byDate.get(picked) || [...days].reverse().find((day) => day.seat > 0) || null;
  const monthIndex = activeMonth ? months.findIndex((row) => row.key === activeMonth.key) : -1;

  if (!tier || !days.some((day) => day.seat > 0) || !activeMonth) return null;

  const toolbar = (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {tiers.length > 1 ? (
        <div
          role="tablist"
          aria-label="Seat tier"
          className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tiers.map((row) => (
            <button
              key={row.tier}
              type="button"
              role="tab"
              aria-selected={row.tier === tier.tier}
              onClick={() => setTierId(row.tier)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium normal-case tracking-normal ${
                row.tier === tier.tier ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {tierChipLabel(row)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous month"
          disabled={monthIndex <= 0}
          onClick={() => setMonthKey(months[monthIndex - 1].key)}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-ink disabled:opacity-30"
        >
          ‹
        </button>
        <span className="min-w-[8.5rem] text-center font-mono text-[12px] text-ink">{monthTitle(activeMonth.year, activeMonth.month)}</span>
        <button
          type="button"
          aria-label="Next month"
          disabled={monthIndex < 0 || monthIndex >= months.length - 1}
          onClick={() => setMonthKey(months[monthIndex + 1].key)}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-ink disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );

  return (
    <ChartPanel
      fit
      className="mt-4"
      title={`Payout calendar · ${tierChipLabel(tier)}`}
      note="Each day is the cash this tier’s weight took from the holder book, in UTC. Paid out and still in the pot are the two ways that cash is held. The lines under a day are the protocol streams printed that day."
      toolbar={toolbar}
    >
      <div>
        {heavy ? (
          <p className="mb-3 text-[12px] leading-relaxed text-muted">
            {heavy.long} has been the heavy UTC weekday, {compactUsd(heavy.avg)} a day across {heavy.n} {heavy.n === 1 ? 'day' : 'days'}, {heavy.active} of them with cash. The figure under each weekday is that average.
          </p>
        ) : null}
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Payout calendar">
          {mondayFirst.map((bucket) => (
            <div key={bucket.short} className="min-w-0 pb-1 text-center">
              <p className="font-mono text-[10px] uppercase tracking-wide text-faint">{bucket.short}</p>
              <p className="truncate font-mono text-[10px] text-muted">{bucket.n ? compactUsd(bucket.avg) : '—'}</p>
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} />;
            const row = cell.row;
            const selected = open?.date === cell.date;
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!row}
                aria-pressed={selected}
                onClick={() => row && setPicked(cell.date)}
                title={row ? `${cell.date} ${compactUsd(row.seat)}` : cell.date}
                className={`flex min-h-[3.25rem] flex-col items-start rounded-md border px-1.5 py-1 text-left ${
                  selected ? 'border-ink' : 'border-line'
                } ${row ? 'hover:border-ink' : 'opacity-40'}`}
                style={{ background: row ? tone(row.seat, monthMax) : 'transparent' }}
              >
                <span className="font-mono text-[10px] text-muted">{cell.day}</span>
                {row ? <span className="mt-auto font-mono text-[10px] text-ink">{compactUsd(row.seat)}</span> : null}
              </button>
            );
          })}
        </div>
        {open ? (
          <div className="mt-4 rounded-lg border border-line bg-panel-2 px-3 py-3">
            <p className="text-[13px] text-ink">{open.date} · {tierChipLabel(tier)}</p>
            <p className="mt-1 font-mono text-[15px] text-ink">{compactUsd(open.seat)}</p>
            <p className="mt-1 text-[12px] text-muted">
              {[
                open.paidShare > 0 ? `Paid out ${compactUsd(open.paidShare)}` : null,
                open.floatShare > 0 ? `Still in the pot ${compactUsd(open.floatShare)}` : null,
              ].filter(Boolean).join(' · ') || 'No holder cash this day'}
            </p>
            {open.pot > 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Holder book that day {compactUsd(open.pot)}
                {open.potLines.length > 1
                  ? ` (${open.potLines.map((line) => `${line.label} ${compactUsd(line.usd)}`).join(', ')})`
                  : ''}. This seat’s weight is the cash above.
              </p>
            ) : null}
            {open.sources.length ? (
              <ul className="mt-3 space-y-1">
                {open.sources.map((source) => (
                  <li key={source.key} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="text-muted">{source.label}</span>
                    <span className="font-mono text-ink">{compactUsd(source.usd)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </ChartPanel>
  );
}
