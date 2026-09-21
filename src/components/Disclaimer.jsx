import React, { useState } from 'react';

/** One NFA body so landing, Markets, and project footers cannot drift. */
export const NFA_TEXT =
  'This dashboard is a community tracker, not financial, tax, or investment advice. Figures are reconstructed from on-chain events and third-party APIs (DexScreener, OpenSea, DefiLlama, project indexers) and can be late, incomplete, or wrong. Double-check contracts, prices, and your own records before you act. Past yield is a trailing sample, not a forecast.';

function InfoIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Home / Markets / Portfolio — matches the landing card language. */
export function NfaBanner({ className = '' }) {
  return (
    <aside
      className={`rounded-xl border border-line bg-panel-2 px-4 py-3 sm:px-5 sm:py-4 ${className}`}
      role="note"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Not financial advice
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{NFA_TEXT}</p>
    </aside>
  );
}

/** Compact strip for dark Markets / Portfolio panels. */
export function NfaNote({ className = '', extra }) {
  return (
    <p className={`text-xs md:text-sm text-slate-400 leading-relaxed ${className}`}>
      <strong className="text-slate-300">Not financial advice.</strong> {NFA_TEXT}
      {extra ? ` ${extra}` : ''}
    </p>
  );
}

export function DisclaimerCopy({ extra }) {
  return (
    <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#1e2228] pt-5">
      <strong className="text-slate-300 not-italic">Disclaimer:</strong> {NFA_TEXT} Yield and ROI
      use mark-to-market spot at the last hourly sync, not the price at the time of each drop.
      {extra ? ` ${extra}` : ''}
    </p>
  );
}

export function MethodologyCard({ accent = 'text-muted', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-share-omit className="card mt-8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <InfoIcon className={`h-4 w-4 ${accent}`} />
          <h3 className="eyebrow text-muted">Methodology</h3>
        </div>
        <span className="font-mono text-[11px] text-faint">{open ? 'Hide' : 'Show'}</span>
      </button>
      <div hidden={!open} className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
        <div className="mb-5 space-y-4 text-[13px] leading-relaxed text-muted">{children}</div>
        <DisclaimerCopy />
      </div>
    </div>
  );
}
