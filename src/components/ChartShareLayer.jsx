import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { CopyChartButton } from './CopyControl';

function prepareHost(el) {
  if (!el) return null;
  if (getComputedStyle(el).position === 'static') el.classList.add('relative');
  return el;
}

function collectChartHosts() {
  const canvases = [...document.querySelectorAll('main canvas, #project-share canvas, #ecosystem-share canvas')];
  const hosts = [];
  const seen = new Set();
  for (const canvas of canvases) {
    const host = canvas.parentElement;
    if (!host || seen.has(host) || host.closest('[data-share-omit]')) continue;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (w < 40 || h < 40) continue;
    seen.add(host);
    prepareHost(host);
    hosts.push({ el: host, tight: h < 160, kind: 'chart' });
  }
  return hosts;
}

function sameHosts(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.el === b[i].el && item.tight === b[i].tight && item.kind === b[i].kind);
}

/** Overlay copy controls on Chart.js canvases. Project/board share is a designed X card. */
export default function ChartShareLayer() {
  const location = useLocation();
  const [hosts, setHosts] = useState([]);

  useEffect(() => {
    let timer = 0;
    const scan = () => {
      const next = collectChartHosts();
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
      {hosts.map(({ el, tight, kind }, i) => (
        <React.Fragment key={`share-${kind}-${i}`}>
          {createPortal(<CopyChartButton host={el} tight={tight} />, el)}
        </React.Fragment>
      ))}
    </>
  );
}
