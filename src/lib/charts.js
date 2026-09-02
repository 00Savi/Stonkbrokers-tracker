import React, { useEffect } from 'react';
import { Chart as ChartJS } from 'chart.js';

export function isNarrow() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

export function compactTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs >= 100) return `${sign}${Math.round(abs)}`;
  if (Number.isInteger(n)) return String(n);
  return `${sign}${abs.toFixed(1).replace(/\.0$/, '')}`;
}

export function compactUsdTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function applyChartJsLayout() {
  if (typeof window === 'undefined') return;
  const narrow = isNarrow();
  ChartJS.defaults.font.size = narrow ? 10 : 12;
  ChartJS.defaults.color = '#94a3b8';
  ChartJS.defaults.plugins.legend.labels.boxWidth = narrow ? 8 : 12;
  ChartJS.defaults.plugins.legend.labels.boxHeight = 8;
  ChartJS.defaults.plugins.legend.labels.padding = narrow ? 6 : 10;
  ChartJS.defaults.plugins.legend.labels.font = { size: narrow ? 10 : 12 };
  ChartJS.defaults.layout.padding = narrow
    ? { top: 4, right: 6, left: 0, bottom: 0 }
    : { top: 6, right: 8 };
  ChartJS.defaults.datasets.line.pointRadius = narrow ? 0 : 2;
  ChartJS.defaults.datasets.line.pointHoverRadius = 4;
  ChartJS.defaults.datasets.line.borderWidth = narrow ? 1.5 : 2;
  ChartJS.defaults.scale.ticks.maxRotation = narrow ? 40 : 0;
  ChartJS.defaults.scale.ticks.minRotation = 0;
  ChartJS.defaults.scale.ticks.autoSkip = true;
  ChartJS.defaults.scale.ticks.maxTicksLimit = narrow ? 5 : 12;
  ChartJS.defaults.scale.ticks.font = { size: narrow ? 9 : 11 };
}

export function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#cbd5e1' } } },
    scales: {
      y: {
        ticks: { color: '#94a3b8', callback: compactTick },
        grid: { color: '#1e2228', borderDash: [4, 4] },
      },
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: '#1e2228', borderDash: [4, 4] },
      },
    },
  };
}

/** Re-apply Chart.js density when the viewport crosses the mobile breakpoint. */
export function ChartMobileSync() {
  useEffect(() => {
    const apply = () => {
      applyChartJsLayout();
      for (const canvas of document.querySelectorAll('canvas')) {
        ChartJS.getChart(canvas)?.resize();
      }
    };
    apply();
    const mq = window.matchMedia('(max-width: 767px)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return null;
}
