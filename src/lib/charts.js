import React, { useEffect } from 'react';
import { Chart as ChartJS } from 'chart.js';

/** One hue per series when they share a chart. No two greens, no two golds. */
export const STREAM_COLORS = {
  amm: '#00a804',
  dex: '#f97316',
  box: '#38bdf8',
  tax: '#f472b6',
  smartLp: '#fbbf24',
  volume: '#8b5cf6',
  delivered: '#00a804',
  vaulted: '#f5b700',
  fees: '#00a804',
  holdersRev: '#8b5cf6',
};

export const TIER_COLORS = ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'];

export const PROJECT_COLORS = {
  stonk: '#00a804',
  mancer: '#8b5cf6',
  tickeryard: '#38bdf8',
  cardwall: '#f5b700',
  index: '#14b8a6',
  printer: '#fb923c',
  oakmont: '#e879f9',
  coattail: '#f43f5e',
};

export const PAIR_COLORS = [
  '#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6',
  '#fb923c', '#14b8a6', '#e879f9', '#94a3b8',
];

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
  if (abs >= 1) return `${sign}${abs.toFixed(1).replace(/\.0$/, '')}`;
  return `${sign}${trimZeros(abs.toFixed(abs >= 0.01 ? 4 : 6))}`;
}

/**
 * Axis labels for USD. Token prices here are often $0.00x; rounding those to
 * the nearest dollar made every tick on the price axis read $0.
 */
export function compactUsdTick(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs >= 100) return `${sign}$${Math.round(abs)}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${trimZeros(abs.toFixed(4))}`;
  if (abs >= 0.0001) return `${sign}$${trimZeros(abs.toFixed(6))}`;
  return `${sign}$${Number(abs.toPrecision(2))}`;
}

function trimZeros(s) {
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
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

export function usdStackOptions() {
  const base = baseChartOptions();
  return {
    ...base,
    scales: {
      ...base.scales,
      x: { ...base.scales.x, stacked: true },
      y: {
        ...base.scales.y,
        stacked: true,
        beginAtZero: true,
        ticks: { ...base.scales.y.ticks, callback: compactUsdTick },
      },
    },
  };
}

export function percentStackOptions() {
  const base = usdStackOptions();
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        min: 0,
        max: 100,
        ticks: { ...base.scales.y.ticks, callback: (v) => `${compactTick(v)}%` },
      },
    },
  };
}

export function dualAxisOptions({ leftTick = compactTick, rightTick = compactUsdTick, rightColor = '#00a804' } = {}) {
  const base = baseChartOptions();
  return {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        callbacks: {
          label(ctx) {
            const v = ctx.parsed?.y;
            const tick = ctx.dataset.yAxisID === 'y1' ? rightTick : leftTick;
            return `${ctx.dataset.label || ''}: ${tick(v)}`;
          },
        },
      },
    },
    scales: {
      ...base.scales,
      y: { ...base.scales.y, position: 'left', ticks: { ...base.scales.y.ticks, callback: leftTick } },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: rightColor, callback: rightTick },
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
