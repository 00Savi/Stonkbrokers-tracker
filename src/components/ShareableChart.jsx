import React, { useRef, useState } from 'react';
import { shareChartToX } from '../lib/share';

/**
 * Wraps a Chart.js surface and puts Share on X in the title row (absolute,
 * so existing card headings keep their layout). The PNG gets a footer with
 * the live site URL and @savicrypto.
 */
export default function ShareableChart({ title, className = '', children }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onShare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await shareChartToX(ref.current, title);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('share chart', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        title="Download a watermarked PNG and open a draft on X"
        className="absolute right-0 -top-9 z-10 flex items-center gap-1.5 rounded-md border border-[#1e2228] bg-[#0e1013] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.57l-5.14-6.72L5.5 22H2.24l8.02-9.16L1.5 2h6.73l4.65 6.18L18.244 2zm-1.15 18.13h1.8L7.01 3.78H5.08l12.01 16.35z" />
        </svg>
        {busy ? 'Saving…' : copied ? 'Draft ready' : 'Share'}
      </button>
      <div ref={ref} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
