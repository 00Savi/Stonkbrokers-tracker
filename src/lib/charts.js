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

function nthCategoryTick(step, count) {
  return function nthTick(value, index) {
    if (index % step !== 0 && index !== count - 1) return '';
    if (this && typeof this.getLabelForValue === 'function') return this.getLabelForValue(value);
    return value;
  };
}

/** X-axis density follows the interval. A 30-day daily tape labels every 2nd or 3rd day, horizontal. */
export function xTicksFor(n, interval = 'daily') {
  const count = Number(n) || 0;
  const narrow = typeof window !== 'undefined' && isNarrow();
  if (count <= 1) return { autoSkip: false, maxTicksLimit: 1, maxRotation: 0, minRotation: 0 };

  if (interval === 'monthly') {
    return { autoSkip: false, maxTicksLimit: Math.max(count, 1), maxRotation: 0, minRotation: 0 };
  }
  if (interval === 'weekly') {
    if (count <= 16) return { autoSkip: false, maxTicksLimit: count, maxRotation: narrow ? 40 : 0, minRotation: 0 };
    return { autoSkip: true, maxTicksLimit: narrow ? 8 : 16, maxRotation: narrow ? 40 : 0, minRotation: 0 };
  }

  // Daily: a week keeps one heading per day. ~2 weeks step by 2. ~30 days step by 3.
  if (count <= 10) {
    return { autoSkip: false, maxTicksLimit: count, maxRotation: narrow ? 40 : 0, minRotation: 0 };
  }
  if (count <= 32) {
    const step = count <= 20 ? 2 : 3;
    return {
      autoSkip: false,
      maxTicksLimit: count,
      maxRotation: 0,
      minRotation: 0,
      callback: nthCategoryTick(step, count),
    };
  }
  if (count <= 96) {
    return { autoSkip: true, maxTicksLimit: narrow ? 8 : 16, maxRotation: 0, minRotation: 0 };
  }
  return { autoSkip: true, maxTicksLimit: narrow ? 6 : 12, maxRotation: 0, minRotation: 0 };
}

export function axisTitle(text) {
  if (!text) return { display: false };
  return {
    display: true,
    text: String(text),
    color: '#8b929b',
    font: { size: 10 },
    padding: { top: 0, bottom: 2 },
  };
}

export function percentTick(value) {
  return `${compactTick(value)}%`;
}

function renderTick(chart, axisId, value) {
  const scaleOpts = chart.options.scales?.[axisId];
  const cb = scaleOpts?.ticks?.callback;
  if (typeof cb === 'function') {
    const scale = chart.scales?.[axisId];
    const out = cb.call(scale || {}, value);
    if (out != null && out !== '') return String(out);
  }
  return String(compactTick(value));
}

function stackParts(ctx) {
  const axisId = ctx.dataset.yAxisID || 'y';
  const stack = ctx.dataset.stack;
  if (!stack) return [];
  const idx = ctx.dataIndex;
  const parts = [];
  for (const ds of ctx.chart.data.datasets || []) {
    if (ds.guide) continue;
    if ((ds.yAxisID || 'y') !== axisId) continue;
    if (ds.stack !== stack) continue;
    const raw = ds.data?.[idx];
    if (raw == null || raw === '') continue;
    const n = typeof raw === 'object' ? Number(raw.y) : Number(raw);
    if (!Number.isFinite(n)) continue;
    parts.push(n);
  }
  return parts;
}

function chartTooltip() {
  return {
    backgroundColor: '#0e1013',
    borderColor: '#1e2228',
    borderWidth: 1,
    titleColor: '#e7e9ec',
    bodyColor: '#8b929b',
    footerColor: '#e7e9ec',
    padding: 10,
    itemSort: (a, b) => (Number(b.parsed?.y) || 0) - (Number(a.parsed?.y) || 0),
    filter(item) {
      if (item.dataset?.guide || item.dataset?.totalLine) return false;
      const y = item.parsed?.y;
      if (y == null || !Number.isFinite(Number(y))) return false;
      const multi = (item.chart?.data?.datasets || []).filter((d) => !d.guide).length > 1;
      if (multi && Number(y) === 0) return false;
      return true;
    },
    callbacks: {
      label(ctx) {
        const axisId = ctx.dataset.yAxisID || 'y';
        let v = Number(ctx.parsed?.y);
        if (ctx.dataset.absTooltip && Number.isFinite(v)) v = Math.abs(v);
        const rendered = renderTick(ctx.chart, axisId, v);
        let name = ctx.dataset.label || '';
        if (ctx.dataset.payback) name = name.replace(/\s*\([^)]*\)\s*$/, '');
        let text = `${name}: ${rendered}`;
        const parts = stackParts(ctx);
        const composition = parts.length >= 2 && parts.every((n) => n >= 0);
        if (composition) {
          const total = parts.reduce((s, n) => s + n, 0);
          if (total) {
            const share = Math.round((Math.abs(v) / total) * 100);
            text += ctx.dataset.shareIsTakeRate ? ` (${share}% take rate)` : ` (${share}%)`;
          }
        }
        const pb = ctx.dataset.payback?.[ctx.dataIndex];
        if (pb != null && Number.isFinite(Number(pb))) text += ` · ${Number(pb).toFixed(1)}y payback`;
        return text;
      },
      footer(items) {
        if (!items?.length) return '';
        const ctx = items[0];
        const parts = stackParts(ctx);
        if (parts.length < 2 || parts.some((n) => n < 0)) return '';
        const total = parts.reduce((s, n) => s + n, 0);
        const axisId = ctx.dataset.yAxisID || 'y';
        return `Total ${renderTick(ctx.chart, axisId, total)}`;
      },
    },
  };
}

/** Bar width vs point count: a 7D week is one fat bar, All daily is a tape. */
export function lastFinite(values) {
  for (let i = (values || []).length - 1; i >= 0; i--) {
    const n = Number(values[i]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function hexAlpha(hex, alpha) {
  const raw = String(hex || '').replace('#', '');
  const h = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return `rgba(139,92,246,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** One cumulative series: light fill, latest value at the end, no legend. */
export function cumulativeBurnDataset(data, color = '#8b5cf6') {
  const last = lastFinite(data);
  return {
    label: 'Cumulative burnt',
    data,
    borderColor: color,
    backgroundColor: hexAlpha(color, 0.14),
    fill: true,
    borderWidth: 1.75,
    tension: 0.3,
    pointRadius: 0,
    spanGaps: true,
    labelEnd: true,
    endLabel: last == null ? '' : compactTick(last),
  };
}

export function barThickness(n) {
  const count = Number(n) || 0;
  if (count <= 3) return 48;
  if (count <= 8) return 28;
  if (count <= 16) return 18;
  if (count <= 40) return 10;
  if (count <= 90) return 6;
  return 3;
}

export function baseChartOptions(labels, interval = 'daily', { yUnit, yTick } = {}) {
  const n = Array.isArray(labels) ? labels.length : Number(labels) || 0;
  const xt = n > 0 ? xTicksFor(n, interval) : {};
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#8b929b' } },
      tooltip: chartTooltip(),
    },
    scales: {
      y: {
        ticks: { color: '#575e67', callback: yTick || compactTick },
        grid: { color: '#171a1f' },
        border: { display: false },
        unit: yUnit || undefined,
        title: axisTitle(yUnit),
      },
      x: {
        ticks: { color: '#575e67', ...xt, ...(n > 0 ? { density: 'set' } : {}) },
        grid: { display: false },
        border: { display: false },
      },
    },
  };
}

export function withYUnit(options, unit, tick) {
  if (!options?.scales?.y || !unit) return options;
  return {
    ...options,
    scales: {
      ...options.scales,
      y: {
        ...options.scales.y,
        unit,
        title: axisTitle(unit),
        ticks: tick ? { ...options.scales.y.ticks, callback: tick } : options.scales.y.ticks,
      },
    },
  };
}

export function usdStackOptions(labels, interval = 'daily') {
  const base = baseChartOptions(labels, interval, { yUnit: 'USD', yTick: compactUsdTick });
  return {
    ...base,
    scales: {
      ...base.scales,
      x: { ...base.scales.x, stacked: true },
      y: {
        ...base.scales.y,
        stacked: true,
        beginAtZero: true,
        unit: 'USD',
        title: axisTitle('USD'),
        ticks: { ...base.scales.y.ticks, callback: compactUsdTick },
      },
    },
  };
}

export function percentStackOptions(labels, interval = 'daily') {
  const base = usdStackOptions(labels, interval);
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        min: 0,
        max: 100,
        unit: '%',
        title: axisTitle('%'),
        ticks: { ...base.scales.y.ticks, callback: percentTick },
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

/** Activations up, deactivations down, zero in the middle. */
export function divergingAxis(ticks, values) {
  const ext = numericExtent(values);
  const peak = ext ? Math.max(Math.abs(ext.min), Math.abs(ext.max)) : 0;
  const max = peak > 0 ? peak * 1.08 : 1;
  return { min: -max, max, beginAtZero: false, ticks };
}

function axisFor(kind, ticks, values, extra = {}) {
  if (kind === 'level') return { ...levelAxis(ticks, values), ...extra };
  if (kind === 'diverging') return { ...divergingAxis(ticks, values), stacked: true, ...extra };
  return { ...flowAxis(ticks, values, extra), ...extra };
}

function inferredUnit(tick) {
  if (tick === compactUsdTick) return 'USD';
  return '';
}

export function dualAxisOptions({
  leftTick = compactTick,
  rightTick = compactUsdTick,
  rightColor = '#00a804',
  leftMax,
  labels,
  interval = 'daily',
  leftKind = 'flow',
  rightKind = 'level',
  leftValues,
  rightValues,
  leftUnit,
  rightUnit,
} = {}) {
  const base = baseChartOptions(labels, interval);
  const leftTicks = { ...base.scales.y.ticks, callback: leftTick };
  const rightTicks = { color: rightColor, callback: rightTick };
  const leftExtra = Number.isFinite(leftMax) && leftMax > 0 ? { max: leftMax } : {};
  const leftUnitText = leftUnit || inferredUnit(leftTick);
  const rightUnitText = rightUnit || inferredUnit(rightTick);
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        position: 'left',
        ...axisFor(leftKind, leftTicks, leftValues, leftExtra),
        unit: leftUnitText || undefined,
        title: axisTitle(leftUnitText),
      },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        border: { display: false },
        ...axisFor(rightKind, rightTicks, rightValues),
        unit: rightUnitText || undefined,
        title: axisTitle(rightUnitText),
      },
    },
  };
}

/** Net active on the left. Activations up and deactivations down on the right. */
export function activityChartOptions(labels, net, ins, outs, interval = 'daily') {
  const down = (outs || []).map((v) => (v == null ? null : -Math.abs(Number(v) || 0)));
  return dualAxisOptions({
    leftTick: compactTick,
    rightTick: compactTick,
    rightColor: '#8b929b',
    labels,
    interval,
    leftKind: 'level',
    rightKind: 'diverging',
    leftValues: net,
    rightValues: [ins, down],
    leftUnit: 'Active units',
    rightUnit: 'Units / day',
  });
}

export function activityDatasets({
  net,
  ins,
  outs,
  lineColor = '#38bdf8',
  lineLabel = 'Net active',
  inColor = '#00a804',
  outColor = '#f43f5e',
  barSize = 18,
} = {}) {
  const down = (outs || []).map((v) => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return null;
    return -Math.abs(n);
  });
  return [
    {
      type: 'line',
      label: lineLabel,
      data: net,
      borderColor: lineColor,
      yAxisID: 'y',
      spanGaps: true,
      order: 0,
    },
    {
      type: 'bar',
      label: 'Daily activations',
      data: ins,
      backgroundColor: inColor,
      borderRadius: 2,
      maxBarThickness: barSize,
      yAxisID: 'y1',
      stack: 'flow',
      order: 1,
    },
    {
      type: 'bar',
      label: 'Daily deactivations',
      data: down,
      backgroundColor: outColor,
      borderRadius: 2,
      maxBarThickness: barSize,
      yAxisID: 'y1',
      stack: 'flow',
      absTooltip: true,
      order: 1,
    },
  ];
}

function isLineDataset(ds, chart) {
  const type = ds.type || chart.config.type;
  return type === 'line';
}

/** Keep end labels in order and at least a line apart, even when the lines finish together. */
function layoutEndLabels(points, top, bottom) {
  const gap = 14;
  const items = points
    .map((p) => ({ ...p, y: p.pt.y }))
    .sort((a, b) => a.y - b.y || a.i - b.i);
  if (!items.length) return items;
  const span = Math.max(gap, bottom - top);
  const need = (items.length - 1) * gap;
  if (need > span) {
    items.forEach((item, i) => {
      item.y = items.length === 1 ? (top + bottom) / 2 : top + (span * i) / (items.length - 1);
    });
    return items;
  }
  for (let i = 1; i < items.length; i++) {
    const min = items[i - 1].y + gap;
    if (items[i].y < min) items[i].y = min;
  }
  const overflow = items[items.length - 1].y - bottom;
  if (overflow > 0) {
    for (const item of items) item.y -= overflow;
  }
  for (let i = items.length - 2; i >= 0; i--) {
    const max = items[i + 1].y - gap;
    if (items[i].y > max) items[i].y = max;
  }
  const underflow = top - items[0].y;
  if (underflow > 0) {
    for (const item of items) item.y += underflow;
  }
  return items;
}

function endLabelTargets(chart) {
  const datasets = chart.data?.datasets || [];
  const lines = datasets.filter((ds) => isLineDataset(ds, chart) && !ds.guide && !ds.labelEnd);
  const auto = lines.length >= 2 && lines.length <= 5;
  return datasets.flatMap((ds, i) => {
    const forced = !!ds.labelEnd;
    const picked = auto && isLineDataset(ds, chart) && !ds.guide;
    if (!forced && !picked) return [];
    return [{ ds, i, text: ds.endLabel || ds.label || '' }];
  }).filter((row) => row.text);
}

// chart.options is a Chart.js resolver proxy. Assigning through it recurses
// (proxy set writes back into itself) and overflows the stack, which blanks
// the page. The plain object on chart.config.options is the one to write.
function configOptions(chart) {
  return chart.config?.options || null;
}

const chartReadabilityPlugin = {
  id: 'chartReadability',
  beforeUpdate(chart) {
    const options = configOptions(chart);
    if (!options) return;
    const n = chart.data?.labels?.length || 0;
    const straight = n > 0 && n < 14;
    for (const ds of chart.data?.datasets || []) {
      if (ds.guide) continue;
      if (straight && isLineDataset(ds, chart) && ds.tension !== 0) ds.tension = 0;
    }
    const lines = (chart.data?.datasets || []).filter((ds) => isLineDataset(ds, chart) && !ds.guide && !ds.labelEnd);
    if (lines.length >= 2 && lines.length <= 5) {
      const plugins = options.plugins || (options.plugins = {});
      const legend = plugins.legend || (plugins.legend = {});
      if (legend.display !== false) legend.display = false;
    }
    for (const scale of Object.values(options.scales || {})) {
      if (scale?.unit && !scale.title?.text) scale.title = axisTitle(scale.unit);
    }
    const catId = options.indexAxis === 'y' ? 'y' : 'x';
    const cat = options.scales?.[catId];
    if (!cat || cat.display === false) return;
    if (cat.type === 'linear' || cat.type === 'logarithmic' || cat.type === 'time') return;
    if (cat.ticks?.density === 'set') return;
    if (n < 2) return;
    cat.ticks = { ...(cat.ticks || {}), ...xTicksFor(n, 'daily'), density: 'set' };
  },
  beforeLayout(chart) {
    const rows = endLabelTargets(chart);
    if (!rows.length) return;
    const ctx = chart.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const need = Math.ceil(Math.max(...rows.map((row) => ctx.measureText(row.text).width)) + 28);
    ctx.restore();
    const options = configOptions(chart);
    if (!options) return;
    const layout = options.layout || (options.layout = {});
    const pad = layout.padding;
    const base = typeof pad === 'number'
      ? { top: pad, right: pad, bottom: pad, left: pad }
      : { top: 4, right: 8, bottom: 0, left: 0, ...(pad || {}) };
    if (chart.$endPadBase == null) chart.$endPadBase = Number(base.right) || 0;
    const right = Math.max(chart.$endPadBase, need);
    if (base.right === right && layout.padding && typeof layout.padding === 'object') return;
    layout.padding = { ...base, right };
  },
  afterDraw(chart) {
    const rows = endLabelTargets(chart);
    if (!rows.length) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let anchor = chartArea?.right || 0;
    for (const scale of Object.values(chart.scales || {})) {
      if (!scale || scale.axis !== 'y' || scale.display === false) continue;
      if (scale.position !== 'right') continue;
      if (Number.isFinite(scale.right)) anchor = Math.max(anchor, scale.right);
    }
    const x = anchor + 8;
    const top = (chartArea?.top || 8) + 2;
    const bottom = (chartArea?.bottom || chart.height || 0) - 2;
    const pending = [];
    for (const row of rows) {
      const meta = chart.getDatasetMeta(row.i);
      if (!meta || meta.hidden) continue;
      const data = row.ds.data || [];
      let pt = null;
      for (let i = data.length - 1; i >= 0; i--) {
        const raw = data[i];
        const y = raw != null && typeof raw === 'object' ? raw.y : raw;
        if (y == null || !Number.isFinite(Number(y))) continue;
        const el = meta.data?.[i];
        if (el && Number.isFinite(el.x) && Number.isFinite(el.y)) {
          pt = el;
          break;
        }
      }
      if (!pt) continue;
      pending.push({ ...row, pt });
    }
    for (const row of layoutEndLabels(pending, top, bottom)) {
      const color = typeof row.ds.borderColor === 'string'
        ? row.ds.borderColor
        : (Array.isArray(row.ds.borderColor) ? row.ds.borderColor[0] : '#e7e9ec');
      ctx.fillStyle = color || '#e7e9ec';
      ctx.fillText(row.text, x, row.y);
    }
    ctx.restore();
  },
};

ChartJS.register(chartReadabilityPlugin);

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
