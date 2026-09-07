import React, { useRef, useState } from 'react';
import { copyChart } from '../lib/share';

/**
 * Wraps a Chart.js surface with a copy-image control in the title row.
 */
export default function ShareableChart({ className = '', children }) {
  const ref = useRef(null);
  const [state, setState] = useState('idle');

  const onCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    try {
      const copied = await copyChart(ref.current);
      setState(copied ? 'copied' : 'saved');
    } catch {
      setState('fail');
    }
    window.setTimeout(() => setState('idle'), 2500);
  };

  const label =
    state === 'busy' ? 'Copying' :
    state === 'copied' ? 'Copied' :
    state === 'saved' ? 'Saved' :
    state === 'fail' ? 'Failed' :
    'Copy';

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={onCopy}
        disabled={state === 'busy'}
        title="Copy chart image"
        className={`absolute right-0 -top-9 z-10 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide disabled:opacity-50 ${
          state === 'copied' || state === 'saved'
            ? 'border-emerald-700/60 bg-emerald-950/80 text-emerald-300'
            : 'border-[#1e2228] bg-[#0e1013] text-slate-300 hover:border-slate-500 hover:text-white'
        }`}
      >
        {label}
      </button>
      <div ref={ref} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
