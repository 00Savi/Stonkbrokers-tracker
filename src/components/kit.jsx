import React from 'react';

/**
 * The shared vocabulary every page is built from.
 *
 * These mirror Clockwork's primitives so the two products read as one family:
 * a mono eyebrow, a big proportional hero figure, a two-segment meter, and a
 * dense table. Nothing here knows what it is displaying.
 */

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A placeholder shaped like the value it is standing in for.
 *
 * Sized in `ch` against the mono stack, so the skeleton occupies the same
 * width the number will and the layout does not jump when it arrives.
 */
export function Skeleton({ ch = 8, height = '1em', className = '' }) {
  return (
    <span
      className={`skeleton inline-block align-middle ${className}`}
      style={{ width: `${ch}ch`, height }}
      aria-hidden="true"
    />
  );
}

/**
 * Show `children`, or a skeleton of the same width while `pending`.
 *
 * The point of routing every corrected figure through one component is that
 * "is this number settled?" becomes a property of the value rather than
 * something each card decides for itself and half of them forget.
 */
export function Value({ pending, ch = 8, children }) {
  if (pending) return <Skeleton ch={ch} />;
  return <>{children}</>;
}

/** Full-card placeholder, for a panel whose entire contents are outstanding. */
export function SkeletonCard({ rows = 3 }) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 pb-4 pt-5">
        <Skeleton ch={18} height="11px" />
      </header>
      <div className="space-y-3 px-5 pb-5">
        <Skeleton ch={10} height="38px" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} ch={26} height="12px" />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Card + figure                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Card header padding is fixed; only the BODY padding varies. A full-bleed
 * child (a table) sets `flush` rather than zeroing the card's own padding,
 * which would drag the title flush against the border too.
 */
export const Card = React.forwardRef(function Card({ eyebrow, sub, corner, children, flush = false, className = '' }, ref) {
  return (
    <section ref={ref} className={`card overflow-hidden ${className}`}>
      {(eyebrow || corner) && (
        <header className="flex items-start justify-between gap-3 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
          <div>
            {eyebrow && <h2 className="eyebrow text-muted">{eyebrow}</h2>}
            {sub && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{sub}</p>}
          </div>
          {corner}
        </header>
      )}
      <div className={flush ? '' : 'px-4 pb-4 sm:px-5 sm:pb-5'}>{children}</div>
    </section>
  );
});

/** Hero figure + trailing descriptor, the reference's signature pairing. */
export function Figure({
  value,
  unit,
  after,
  tone = 'ink',
  size = 'text-[28px] sm:text-[36px] md:text-[44px]',
  pending = false,
}) {
  const toneClass = { ink: 'text-ink', accent: 'text-accent', danger: 'text-danger' }[tone];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`hero ${size} ${toneClass}`}>
        {pending ? <Skeleton ch={7} height="0.8em" /> : value}
        {unit && !pending && <span className="ml-1 text-[0.55em] text-muted">{unit}</span>}
      </span>
      {after && <span className="font-mono text-[12px] text-muted">{after}</span>}
    </div>
  );
}

/** A small labelled figure, for the strips along the bottom of a card. */
export function Stat({ label, value, tone = 'ink', pending = false, ch = 6, note }) {
  const toneClass = { ink: 'text-ink', accent: 'text-accent', danger: 'text-danger', muted: 'text-muted' }[tone];
  return (
    <div>
      <div className="eyebrow text-faint">{label}</div>
      <div className={`num mt-1 text-[15px] leading-tight sm:text-[18px] ${toneClass}`}>
        <Value pending={pending} ch={ch}>
          {value}
        </Value>
        {note && !pending && <span className="ml-1.5 font-mono text-[11px] text-muted">{note}</span>}
      </div>
    </div>
  );
}

/** Dense row of Stat figures under a hero, or as a heading KPI strip. */
export function KpiStrip({ children, className = '' }) {
  const n = React.Children.count(children);
  const cols =
    n <= 2
      ? 'grid-cols-2'
      : n === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : n === 5
          ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
          : 'grid-cols-2 lg:grid-cols-4';
  return <div className={`grid gap-x-6 gap-y-4 ${cols} ${className}`}>{children}</div>;
}

/**
 * Two-segment proportional bar.
 *
 * Categorical green + violet, NOT green + red: green/red measures deutan
 * dE 3.6 and is unreadable for red-green colourblind users. Segments are
 * separated by a 2px surface gap rather than a stroke, and the legend is
 * always rendered, so identity never rests on colour alone.
 */
export function SplitBar({ a, b, labelA, labelB, valueA, valueB }) {
  const total = (a || 0) + (b || 0);
  const pctA = total > 0 ? (a / total) * 100 : 50;
  const pctB = 100 - pctA;

  return (
    <div>
      <div className="flex h-8 w-full gap-[2px] overflow-hidden">
        <div
          className="flex items-center rounded-l-[4px] bg-mark-green px-2.5"
          style={{ width: `${pctA}%` }}
          title={`${labelA}: ${valueA}`}
        >
          {pctA > 26 && (
            <span className="truncate font-mono text-[11px] font-medium text-black">
              {labelA} · {valueA}
            </span>
          )}
        </div>
        <div
          className="flex items-center justify-end rounded-r-[4px] bg-mark-violet px-2.5"
          style={{ width: `${pctB}%` }}
          title={`${labelB}: ${valueB}`}
        >
          {pctB > 26 && (
            <span className="truncate font-mono text-[11px] font-medium text-black">
              {labelB} · {valueB}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px] bg-mark-green" />
          {labelA} <span className="text-ink">{valueA}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px] bg-mark-violet" />
          {labelB} <span className="text-ink">{valueB}</span>
        </span>
      </div>
    </div>
  );
}

/** Small state chip. `tone` never travels alone -- the text is the signal. */
export function Tag({ tone = 'good', children, title }) {
  const styles = {
    good: 'bg-accent/10 text-accent',
    danger: 'bg-danger/10 text-danger',
    warn: 'bg-warn/10 text-warn',
    plain: 'border border-line text-faint',
  }[tone];
  return (
    <span title={title} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${styles}`}>
      {children}
    </span>
  );
}

export function BetaTag() {
  return (
    <Tag tone="plain" title="This tracker is in beta">
      beta
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export const usd = (v, digits = 0) =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(Number(v));

/** Short USD for table cells and mobile stat tiles. Full value stays in `title`. */
export function compactUsd(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  return usd(n, abs < 0.01 ? 6 : 4);
}

export function compactNum(v, decimals = 0) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Sub-dollar prices need their significant digits; dollar prices do not. */
export const price = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n < 1 ? usd(n, 6) : usd(n, 2);
};

export const eth = (v, digits = 4) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);

export const num = (v) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString();

export const pct = (v, digits = 1) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(digits)}%`;

export const YIELD_WINDOWS = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'all', label: 'All' },
];

export const CHART_INTERVALS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

/** Range or interval control. Sticky chrome uses a small select, not a pill group. */
export function WindowBar({ value, onChange, windows = YIELD_WINDOWS, compact = false, label = 'Chart range' }) {
  return (
    <div className="relative shrink-0">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-md border border-line bg-panel font-medium text-ink [color-scheme:dark] hover:border-muted focus:border-muted focus:outline-none ${
          compact ? 'h-8 py-0 pl-2 pr-6 text-[11px] sm:text-xs' : 'h-9 py-0 pl-2.5 pr-7 text-xs'
        }`}
      >
        {windows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-faint"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function IntervalBar({ value, onChange, compact = false }) {
  return (
    <WindowBar
      value={value}
      onChange={onChange}
      windows={CHART_INTERVALS}
      compact={compact}
      label="Chart interval"
    />
  );
}

export function scaleAnnualYield(annual, period) {
  const n = Number(annual) || 0;
  if (period === 'D') return n / 365;
  if (period === 'W') return n / 52;
  return n;
}

export function yieldSuffix(period) {
  if (period === 'D') return '/day';
  if (period === 'W') return '/wk';
  return '/yr';
}

export function yieldPeriodLabel(period) {
  if (period === 'D') return 'Daily';
  if (period === 'W') return 'Weekly';
  return 'Annualized';
}

/** Compact D / W / Y control that sits next to a Yield column heading. */
export function YieldPeriodToggle({ value, onChange, className = '' }) {
  return (
    <div
      className={`inline-flex rounded-md border border-line bg-panel p-0.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {['D', 'W', 'Y'].map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`min-w-[1.5rem] rounded px-1.5 py-0.5 font-mono text-[10px] ${
            value === p ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
