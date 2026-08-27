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
export function Card({ eyebrow, sub, corner, children, flush = false, className = '' }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(eyebrow || corner) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            {eyebrow && <h2 className="eyebrow text-muted">{eyebrow}</h2>}
            {sub && <p className="mt-1 font-mono text-[11px] leading-relaxed text-faint">{sub}</p>}
          </div>
          {corner}
        </header>
      )}
      <div className={flush ? '' : 'px-5 pb-5'}>{children}</div>
    </section>
  );
}

/** Hero figure + trailing descriptor, the reference's signature pairing. */
export function Figure({
  value,
  unit,
  after,
  tone = 'ink',
  size = 'text-[44px]',
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
      <div className={`num mt-1 text-[18px] ${toneClass}`}>
        <Value pending={pending} ch={ch}>
          {value}
        </Value>
        {note && !pending && <span className="ml-1.5 font-mono text-[11px] text-muted">{note}</span>}
      </div>
    </div>
  );
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
