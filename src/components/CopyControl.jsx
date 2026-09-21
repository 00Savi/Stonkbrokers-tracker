import React, { useRef, useState } from 'react';
import { copyChart, copyElement } from '../lib/share';

export function copySectionEl(el, id) {
  const node = el || (id ? document.getElementById(id) : null);
  if (!node) throw new Error('Nothing to copy');
  const slug = id || node.id || 'section';
  return copyElement(node, { filename: `savi-${slug}.png`, maxW: 1080 });
}

export function shareSlug(label, fallback = 'card') {
  const slug = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

const SECTION_COPY_LABEL = {
  roi: 'ROI',
  yield: 'Yield',
  historical: 'Yield',
  revenue: 'Revenue',
  night: 'Night',
  liquidity: 'Liquidity',
  burn: 'Burn',
  activation: 'Activation',
  ownership: 'Ownership',
  rankings: 'All tiers',
  wrap: 'Wrap',
  holders: 'Holders',
};

/**
 * One heading row with Copy section. Copies every chart and table in this
 * tab (all revenue charts, all burn tables, etc.), not a single card.
 */
export function ShareSection({ id, title, className = '', children }) {
  const ref = useRef(null);
  const label = title || SECTION_COPY_LABEL[id] || String(id || 'Section');
  return (
    <section id={id} ref={ref} className={className}>
      <div className="mb-3 flex items-center justify-between gap-3" data-share-omit>
        <h2 className="eyebrow text-muted">{label}</h2>
        <CopyControl
          alwaysLabel
          heading
          idleLabel="Copy section"
          title={`Copy all ${label} charts and tables for X`}
          className="bg-[#08090b]"
          onCopy={() => copySectionEl(ref.current, id)}
        />
      </div>
      {children}
    </section>
  );
}

function CopyIcon({ ok }) {
  if (ok) {
    return (
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M5 12l5 5L20 7" />
      </svg>
    );
  }
  return (
    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function CopyControl({
  onCopy,
  idleLabel = 'Copy',
  title = 'Copy image',
  tight = false,
  alwaysLabel = false,
  className = '',
  overlay = false,
  heading = false,
}) {
  const [state, setState] = useState('idle');

  async function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    try {
      const copied = await onCopy();
      setState(copied ? 'copied' : 'saved');
    } catch (err) {
      console.error('copy failed', err);
      setState('fail');
    }
    window.setTimeout(() => setState('idle'), 2500);
  }

  const label =
    state === 'busy' ? 'Copying' :
    state === 'copied' ? 'Copied' :
    state === 'saved' ? 'Saved' :
    state === 'fail' ? 'Failed' :
    idleLabel;
  const ok = state === 'copied' || state === 'saved';

  const iconOnly = (overlay || tight) && !alwaysLabel;
  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'busy'}
      data-share-omit
      data-heading-copy={heading ? '' : undefined}
      title={title}
      aria-label={label}
      className={`inline-flex items-center justify-center gap-1 rounded-md border font-mono text-[10px] disabled:opacity-60 ${
        iconOnly ? 'h-7 w-7' : 'min-h-8 px-1.5 py-1 sm:px-2'
      } ${
        ok
          ? 'border-emerald-700/60 bg-emerald-950/80 text-emerald-300'
          : 'border-line bg-panel/90 text-muted hover:text-ink'
      } ${className}`}
    >
      <CopyIcon ok={ok} />
      {iconOnly ? null : (
        <span className={alwaysLabel ? '' : 'hidden sm:inline'}>{label}</span>
      )}
    </button>
  );

  if (!overlay) return button;

  return (
    <div
      data-share-omit
      className={`pointer-events-none absolute z-30 flex flex-col items-end ${
        tight ? 'right-2 top-2' : 'right-3 top-3'
      }`}
    >
      <div className="pointer-events-auto">{button}</div>
      {ok && (
        <div
          role="status"
          className="pointer-events-none mt-1 rounded-md border border-emerald-700/60 bg-emerald-950/90 px-2 py-1 font-mono text-[10px] text-emerald-300"
        >
          {state === 'copied' ? 'Copied' : 'PNG saved'}
        </div>
      )}
    </div>
  );
}

export function CopyChartButton({ host, tight }) {
  return (
    <CopyControl
      overlay
      tight={tight}
      idleLabel="Copy"
      title="Copy this chart for X"
      onCopy={() => copyChart(host)}
    />
  );
}

export function CopyTableButton({ host, tight }) {
  return (
    <CopyControl
      overlay
      tight={tight}
      idleLabel="Copy"
      title="Copy this table for X"
      onCopy={() => copyElement(host, { filename: 'savi-table.png' })}
    />
  );
}

export function CopySectionButton({ host }) {
  const id = host?.id || 'section';
  return (
    <CopyControl
      overlay
      alwaysLabel
      idleLabel="Copy all"
      title="Copy this whole section for X"
      className="bg-[#08090b]"
      onCopy={() => copySectionEl(host, id)}
    />
  );
}

export function CopyPageButton({
  onCopy,
  idleLabel = 'Copy',
  title = 'Copy image for X',
}) {
  return (
    <CopyControl
      idleLabel={idleLabel}
      title={title}
      className="bg-[#08090b]"
      onCopy={onCopy}
    />
  );
}
