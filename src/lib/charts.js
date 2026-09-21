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
  // Payout / received — amber-gold, not protocol green and not burn orange.
  holdersRev: '#f7931a',
  booster: '#a3e635',
};

export const TIER_COLORS = ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'];

export const PROJECT_COLORS = {
  stonk: '#00a804',
  interns: '#fbbf24',
  mancer: '#8b5cf6',
  tickeryard: '#38bdf8',
  cardwall: '#f5b700',
  index: '#14b8a6',
  printer: '#fb923c',
  oakmont: '#e879f9',
  coattail: '#f43f5e',
  nightshades: '#818cf8',
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
  ChartJS.defaults.font.size = narrow ? 10 : 11;
  ChartJS.defaults.color = '#8b929b';
  ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
  ChartJS.defaults.plugins.legend.labels.boxHeight = 8;
  ChartJS.defaults.plugins.legend.labels.padding = narrow ? 6 : 8;
  ChartJS.defaults.plugins.legend.labels.font = { size: narrow ? 10 : 11 };
  ChartJS.defaults.layout.padding = narrow
    ? { top: 4, right: 6, left: 0, bottom: 0 }
    : { top: 4, right: 8 };
  ChartJS.defaults.datasets.line.pointRadius = (ctx) => {
    const n = ctx?.chart?.data?.labels?.length || 0;
    return n > 0 && n < 8 ? 2.5 : 0;
  };
  ChartJS.defaults.datasets.line.pointHoverRadius = 3;
  ChartJS.defaults.datasets.line.borderWidth = narrow ? 1.5 : 1.75;
  ChartJS.defaults.datasets.line.fill = false;
  ChartJS.defaults.scale.ticks.maxRotation = narrow ? 40 : 0;
  ChartJS.defaults.scale.ticks.minRotation = 0;
  ChartJS.defaults.scale.ticks.autoSkip = true;
  ChartJS.defaults.scale.ticks.maxTicksLimit = narrow ? 5 : 8;
  ChartJS.defaults.scale.ticks.font = { size: narrow ? 9 : 10 };
}

/** X-axis density: show every tick on a week, skip on a long daily tape. */
export function xTicksFor(n) {
  const count = Number(n) || 0;
  const narrow = typeof window !== 'undefined' && isNarrow();
  if (count <= 1) return { autoSkip: false, maxTicksLimit: 1, maxRotation: 0 };
  if (count <= 8) return { autoSkip: false, maxTicksLimit: count, maxRotation: narrow ? 40 : 0 };
  if (count <= 16) return { autoSkip: true, maxTicksLimit: narrow ? 6 : count, maxRotation: narrow ? 40 : 0 };
  return { autoSkip: true, maxTicksLimit: narrow ? 5 : 8, maxRotation: narrow ? 40 : 0 };
}

/** Bar width vs point count: a 7D week is one fat bar, All daily is a tape. */
export function barThickness(n) {
  const count = Number(n) || 0;
  if (count <= 3) return 48;
  if (count <= 8) return 28;
  if (count <= 16) return 18;
  if (count <= 40) return 10;
  if (count <= 90) return 6;
  return 3;
}

export function baseChartOptions(labels) {
  const n = Array.isArray(labels) ? labels.length : Number(labels) || 0;
  const xt = n > 0 ? xTicksFor(n) : {};
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#8b929b' } },
      tooltip: {
        backgroundColor: '#0e1013',
        borderColor: '#1e2228',
        borderWidth: 1,
        titleColor: '#e7e9ec',
        bodyColor: '#8b929b',
        padding: 10,
      },
    },
    scales: {
      y: {
        ticks: { color: '#575e67', callback: compactTick },
        grid: { color: '#171a1f' },
        border: { display: false },
      },
      x: {
        ticks: { color: '#575e67', ...xt },
        grid: { display: false },
        border: { display: false },
      },
    },
  };
}

export function usdStackOptions(labels) {
  const base = baseChartOptions(labels);
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

export function percentStackOptions(labels) {
  const base = usdStackOptions(labels);
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

export function numericExtent(values) {
  const nums = [];
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    const n = Number(v);
    if (Number.isFinite(n)) nums.push(n);
  };
  walk(values);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Daily bars / flows: always include zero, cap just above the max bar. */
export function flowAxis(ticks, values, { max } = {}) {
  const axis = { beginAtZero: true, min: 0, ticks };
  if (Number.isFinite(max) && max > 0) {
    axis.max = max;
    return axis;
  }
  const ext = numericExtent(values);
  if (ext && ext.max > 0) axis.max = ext.max * 1.08;
  return axis;
}

/**
 * Stock-like series (net active, holders, TVL, price): zoom to the move
 * instead of pinning the floor at zero when the tape is already up at 1.8k.
 */
export function levelAxis(ticks, values) {
  const axis = { beginAtZero: false, grace: '18%', ticks };
  const ext = numericExtent(values);
  if (!ext) return axis;
  const span = ext.max - ext.min;
  const pad = span > 0 ? span * 0.18 : Math.max(Math.abs(ext.min) * 0.05, 1);
  let min = ext.min - pad;
  let max = ext.max + pad;
  if (ext.min >= 0) min = Math.max(0, min);
  if (ext.max <= 0) max = Math.min(0, max);
  if (ext.min === 0 && ext.max > 0) {
    return { beginAtZero: true, min: 0, max, ticks };
  }
  return { beginAtZero: false, min, max, ticks };
}

function axisFor(kind, ticks, values, extra = {}) {
  return kind === 'level'
    ? { ...levelAxis(ticks, values), ...extra }
    : { ...flowAxis(ticks, values, extra), ...extra };
}

export function dualAxisOptions({
  leftTick = compactTick,
  rightTick = compactUsdTick,
  rightColor = '#00a804',
  leftMax,
  labels,
  leftKind = 'flow',
  rightKind = 'level',
  leftValues,
  rightValues,
} = {}) {
  const base = baseChartOptions(labels);
  const leftTicks = { ...base.scales.y.ticks, callback: leftTick };
  const rightTicks = { color: rightColor, callback: rightTick };
  const leftExtra = Number.isFinite(leftMax) && leftMax > 0 ? { max: leftMax } : {};
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
      y: {
        ...base.scales.y,
        position: 'left',
        ...axisFor(leftKind, leftTicks, leftValues, leftExtra),
      },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        ...axisFor(rightKind, rightTicks, rightValues),
      },
    },
  };
}

/** Net active (zoomed) vs daily in/out bars (from zero). */
export function activityChartOptions(labels, net, ins, outs) {
  return dualAxisOptions({
    leftTick: compactTick,
    rightTick: compactTick,
    rightColor: '#8b929b',
    labels,
    leftKind: 'level',
    rightKind: 'flow',
    leftValues: net,
    rightValues: [ins, outs],
  });
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
