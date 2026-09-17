import React, { useState } from 'react';
import { copyChart } from '../lib/share';

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
  className = '',
  overlay = false,
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
    } catch {
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

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'busy'}
      data-share-omit
      title={title}
      aria-label={title}
      className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[10px] disabled:opacity-60 sm:px-2 ${
        ok
          ? 'border-emerald-700/60 bg-emerald-950/80 text-emerald-300'
          : 'border-line bg-panel/90 text-muted hover:text-ink'
      } ${className}`}
    >
      <CopyIcon ok={ok} />
      <span className={tight ? 'hidden' : 'hidden sm:inline'}>{label}</span>
    </button>
  );

  if (!overlay) return button;

  return (
    <div
      data-share-omit
      className={`pointer-events-none absolute z-20 flex flex-col items-end ${
        tight ? 'right-1 top-1' : 'right-1 top-1 sm:right-2 sm:top-2'
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
      title="Copy chart image"
      onCopy={() => copyChart(host)}
    />
  );
}

export function CopyPageButton({
  onCopy,
  idleLabel = 'Copy for X',
  title = 'Copy a compact image for X',
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
