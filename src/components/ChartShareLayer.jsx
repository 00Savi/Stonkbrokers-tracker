import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { copyChart } from '../lib/share';

function collectHosts() {
  const canvases = [...document.querySelectorAll('canvas')];
  const hosts = [];
  const seen = new Set();
  for (const canvas of canvases) {
    const host = canvas.parentElement;
    if (!host || seen.has(host)) continue;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (w < 40 || h < 40) continue;
    seen.add(host);
    if (getComputedStyle(host).position === 'static') host.classList.add('relative');
    hosts.push({ el: host, tight: h < 160 });
  }
  return hosts;
}

function sameHosts(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.el === b[i].el && item.tight === b[i].tight);
}

function CopyButton({ host, tight }) {
  const [state, setState] = useState('idle');

  async function onCopy(event) {
    event.preventDefault();
    event.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    try {
      const copied = await copyChart(host);
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
    'Copy';

  return (
    <div
      data-share-omit
      className={`pointer-events-none absolute z-20 flex flex-col items-end ${
        tight ? 'right-1 top-1' : 'right-1 top-1 sm:right-2 sm:top-2'
      }`}
    >
      <button
        type="button"
        onClick={onCopy}
        disabled={state === 'busy'}
        data-share-omit
        className={`pointer-events-auto inline-flex min-h-8 items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[10px] backdrop-blur-sm sm:px-2 disabled:opacity-60 ${
          state === 'copied' || state === 'saved'
            ? 'border-emerald-700/60 bg-emerald-950/80 text-emerald-300'
            : 'border-line bg-panel/90 text-muted hover:text-ink'
        }`}
        title="Copy chart image"
        aria-label="Copy chart image"
      >
        {state === 'copied' || state === 'saved' ? (
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : (
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
          </svg>
        )}
        <span className={tight ? 'hidden' : 'hidden sm:inline'}>{label}</span>
      </button>
      {(state === 'copied' || state === 'saved') && (
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

/** Overlay a copy-chart control on every Chart.js canvas in the current view. */
export default function ChartShareLayer() {
  const location = useLocation();
  const [hosts, setHosts] = useState([]);

  useEffect(() => {
    let timer = 0;
    const scan = () => {
      const next = collectHosts();
      setHosts((prev) => (sameHosts(prev, next) ? prev : next));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 280);
    };
    schedule();
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [location.pathname, location.search]);

  if (location.pathname === '/portfolio') return null;

  return (
    <>
      {hosts.map(({ el, tight }, i) => (
        <React.Fragment key={`chart-copy-${i}`}>
          {createPortal(<CopyButton host={el} tight={tight} />, el)}
        </React.Fragment>
      ))}
    </>
  );
}
