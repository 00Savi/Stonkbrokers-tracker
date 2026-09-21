import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { CopyChartButton, CopyTableButton } from './CopyControl';

function hasHeadingCopy(el) {
  return !!(el && el.querySelector('[data-heading-copy]'));
}

function pickHost(el) {
  if (!el) return null;
  const card = el.closest('.card');
  if (card) return card;
  const panel = el.closest('.rounded-xl, .rounded-2xl');
  if (panel) return panel;
  return el.closest('.overflow-x-auto') || el.parentElement;
}

function prepareHost(el) {
  if (!el) return null;
  if (getComputedStyle(el).position === 'static') el.classList.add('relative');
  el.classList.add('group');
  return el;
}

function collectChartHosts() {
  const hosts = [];
  const seen = new Set();

  const take = (start, kind) => {
    if (!start || start.closest('[data-share-omit]')) return;
    const host = pickHost(start);
    if (!host || seen.has(host) || host.closest('[data-share-omit]')) return;
    if (hasHeadingCopy(host)) return;
    const card = start.closest('.card');
    if (card && card !== host && hasHeadingCopy(card)) return;
    const w = host.clientWidth || 0;
    const h = host.clientHeight || 0;
    if (w < 80 || h < 40) return;
    seen.add(host);
    prepareHost(host);
    hosts.push({ el: host, tight: h < 140, kind });
  };

  const canvases = [...document.querySelectorAll('main canvas, #project-share canvas, #ecosystem-share canvas')];
  for (const canvas of canvases) {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (w < 40 || h < 40) continue;
    take(canvas, 'chart');
  }
  const tables = [...document.querySelectorAll('main table, #project-share table, #ecosystem-share table')];
  for (const table of tables) {
    take(table, 'table');
  }
  return hosts;
}

function sameHosts(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.el === b[i].el && item.tight === b[i].tight && item.kind === b[i].kind);
}

/** Overlay copy on panels that do not already have a heading Copy. */
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

  if (location.pathname === '/portfolio' || location.pathname === '/broker') return null;

  return (
    <>
      {hosts.map(({ el, tight, kind }, i) => (
        <React.Fragment key={`share-${kind}-${i}`}>
          {createPortal(
            kind === 'table'
              ? <CopyTableButton host={el} tight={tight} />
              : <CopyChartButton host={el} tight={tight} />,
            el
          )}
        </React.Fragment>
      ))}
    </>
  );
}
