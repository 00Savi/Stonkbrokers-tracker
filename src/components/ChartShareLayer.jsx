import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { shareChartToX } from '../lib/share';

function headingFor(canvas) {
  const host = canvas.parentElement;
  const card = canvas.closest('.rounded-2xl, .rounded-xl, article, section') || host?.parentElement;
  const heading = card?.querySelector('h2, h3, h4');
  const text = heading?.textContent?.replace(/\s+/g, ' ').trim();
  return text || "Savi's Dashboard";
}

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
    hosts.push({ el: host, title: headingFor(canvas), tight: h < 160 });
  }
  return hosts;
}

function sameHosts(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.el === b[i].el && item.title === b[i].title && item.tight === b[i].tight);
}

function ShareButton({ host, title, tight }) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  async function onShare(event) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setHint('');
    try {
      await shareChartToX(host, title);
      setHint('PNG saved — attach it on X');
    } catch {
      setHint('Could not share');
    } finally {
      setBusy(false);
      window.setTimeout(() => setHint(''), 4000);
    }
  }

  return (
    <div
      className={`pointer-events-none absolute z-20 flex flex-col items-end gap-1 ${
        tight ? 'right-1 top-1' : 'right-1 top-1 sm:right-2 sm:top-2'
      }`}
    >
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        className="pointer-events-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-panel/90 px-1.5 py-1 font-mono text-[10px] text-muted backdrop-blur-sm hover:text-ink disabled:opacity-60 sm:px-2"
        title="Download a watermarked PNG and open a draft post on X"
        aria-label="Share chart to X"
      >
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.57l-5.14-6.72L5.5 22H2.24l8.02-9.16L1.5 2h6.73l4.65 6.18L18.244 2zm-1.15 18.13h1.8L7.01 3.78H5.08l12.01 16.35z" />
        </svg>
        <span className={tight ? 'hidden' : 'hidden sm:inline'}>{busy ? 'Sharing' : 'Share'}</span>
      </button>
      {hint ? (
        <span className="pointer-events-none max-w-[10rem] text-right font-mono text-[9px] leading-tight text-faint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Overlay a Share-to-X control on every Chart.js canvas in the current view. */
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

  return (
    <>
      {hosts.map(({ el, title, tight }, i) => (
        <React.Fragment key={`chart-share-${i}`}>
          {createPortal(<ShareButton host={el} title={title} tight={tight} />, el)}
        </React.Fragment>
      ))}
    </>
  );
}
