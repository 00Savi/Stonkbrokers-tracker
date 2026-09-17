import React from 'react';

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

export function MethodologyCard({ accent = 'text-blue-500', children }) {
  return (
    <div data-share-omit className="bg-[#0e1013] rounded-xl p-5 md:p-6 border border-[#1e2228] shadow-lg mt-8">
      <div className="flex items-center gap-2 mb-4">
        <InfoIcon className={`w-5 h-5 ${accent}`} />
        <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
      </div>
      <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">{children}</div>
      <DisclaimerCopy />
    </div>
  );
}
