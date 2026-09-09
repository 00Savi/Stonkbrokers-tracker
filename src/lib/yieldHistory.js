import { trailingSnapshots, usableSnapshots } from './snapshots';

/** Yield / ROI chart windows. `all` is every usable snapshot we still have. */
export const YIELD_WINDOWS = [
  { id: '7d', label: 'Weekly', days: 7 },
  { id: '30d', label: 'Monthly', days: 30 },
  { id: 'all', label: 'All', days: 0 },
];

export const TIER_ROI_COLORS = ['#00a804', '#8b5cf6', '#38bdf8', '#f5b700', '#f472b6'];

/** Usable snapshots for Weekly / Monthly / All (days=0 means the full record). */
export function windowSnapshots(snapshots, timeframe = 'all') {
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 0;
  return trailingSnapshots(snapshots, days);
}

export function windowLen(timeframe, total) {
  const n = Number(total) || 0;
  if (timeframe === '7d') return Math.min(7, n);
  if (timeframe === '30d') return Math.min(30, n);
  return n;
}

export function windowPeriodLabel(timeframe) {
  if (timeframe === '7d') return '7D';
  if (timeframe === '30d') return '30D';
  return 'All';
}

/** Slice parallel date/value arrays to weekly, monthly, or all. */
export function sliceCols(labels, cols, timeframe = 'all') {
  const n = windowLen(timeframe, (labels || []).length);
  return {
    labels: (labels || []).slice(-n),
    cols: (cols || []).map((col) => {
      const data = (col.data || []).slice(-n);
      return {
        ...col,
        data,
        total: data.reduce((s, v) => s + (Number(v) || 0), 0),
      };
    }),
  };
}

function padLeft(arr, n) {
  const a = Array.isArray(arr) ? arr.map((v) => Number(v) || 0) : [];
  if (a.length >= n) return a.slice(-n);
  return [...Array(Math.max(0, n - a.length)).fill(0), ...a];
}

function mdKey(label) {
  const m = String(label || '').match(/(\d{1,2})\D+(\d{1,2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(label || '');
}

/**
 * Date axis + stream columns for a project's revenue chart.
 * Card Wall uses the vault ledger; specials use cashflow; Anvil uses the 7-day
 * on-chain walk, stretched across snapshot dates so Weekly / All actually differ
 * when yield_days history has not been copied into data.json yet.
 */
export function protocolRevenueChart(project) {
  const ledger = project?.ledger;
  if (ledger?.historyDates?.length) {
    const n = ledger.historyDates.length;
    return {
      labels: ledger.historyDates,
      cols: [
        { key: 'delivered', label: 'Delivered to members', color: '#00a804', data: padLeft(ledger.historyDelivered, n) },
        { key: 'vaulted', label: 'Still on the wall', color: '#f5b700', data: padLeft(ledger.historyVaulted, n) },
      ],
    };
  }

  const cf = project?.cashflow;
  if (cf?.dailyDates?.length) {
    const n = cf.dailyDates.length;
    return {
      labels: cf.dailyDates,
      cols: [
        { key: 'fees', label: 'Fees', color: '#00a804', data: padLeft(cf.dailyFees, n) },
        { key: 'holders', label: 'Holders revenue', color: '#8b5cf6', data: padLeft(cf.dailyRevenue, n) },
      ],
    };
  }

  const r = project?.revenue || {};
  const short = r.dailyDates?.length ? r.dailyDates : (project?.tiers?.[0]?.dailyDates || []);
  const snaps = usableSnapshots(project?.dailySnapshots);
  const snapLabels = snaps.map((s) => s.date).filter(Boolean);
  const labels = r.historyDates?.length
    ? r.historyDates
    : (snapLabels.length > short.length ? snapLabels : short);

  const idx = new Map(short.map((d, i) => [mdKey(d), i]));
  const snapIdx = new Map(snapLabels.map((d, i) => [mdKey(d), i]));
  const t0Daily = snaps.map((s) => {
    const y = Number(s.tiers?.find((t) => t.tier === 'T0')?.yieldUsd) || 0;
    return y > 0 ? y / 365 : 0;
  });

  const ratios = [];
  short.forEach((d, i) => {
    const si = snapIdx.get(mdKey(d));
    const amm = Number(r.dailyAmm?.[i]) || 0;
    const t0 = si != null ? t0Daily[si] : 0;
    if (amm > 0 && t0 > 0) ratios.push(amm / t0);
  });
  const scale = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;

  const stream = (arr, histFallback) =>
    labels.map((d, i) => {
      const j = idx.get(mdKey(d));
      if (j != null) return Number(arr?.[j]) || 0;
      if (!histFallback) return 0;
      if (r.historyTotalUsd?.[i] != null) return Number(r.historyTotalUsd[i]) || 0;
      const si = snapIdx.get(mdKey(d));
      if (si != null) return +(t0Daily[si] * scale).toFixed(2);
      return 0;
    });

  return {
    labels,
    cols: [
      { key: 'amm', label: 'AMM & protocol', color: '#00a804', data: stream(r.dailyAmm, true) },
      { key: 'dex', label: 'DEX fees', color: '#00a804', data: stream(r.dailyDex, false) },
      { key: 'box', label: 'Clock-In / order', color: '#38bdf8', data: stream(r.dailySecurityBox, false) },
      { key: 'launch', label: 'Launch + bonding', color: '#8b5cf6', data: stream(r.dailyLaunchpad, false) },
      { key: 'tax', label: 'Curve tax', color: '#f472b6', data: stream(r.dailyBondingTax, false) },
      ...(r.smartLp
        ? [{ key: 'smartLp', label: 'StonkBroker Fees', color: '#fbbf24', data: stream(r.dailySmartLp, false) }]
        : []),
    ],
  };
}

export function tierRoiDatasets(snaps, tiers, { floorCostUsd = 0, tokenPriceUsd = 0, colors = TIER_ROI_COLORS } = {}) {
  return (tiers || []).map((t, i) => {
    const tc = floorCostUsd + (t.reqTokens || 0) * tokenPriceUsd;
    const currentRoi = tc > 0 && t.trackedAnnualYieldUsd > 0
      ? ((t.trackedAnnualYieldUsd / tc) * 100).toFixed(2)
      : '0.00';
    return {
      label: `${t.tier} ROI (${currentRoi}%)`,
      data: snaps.map((s) => s.tiers?.find((st) => st.tier === t.tier)?.roi || 0),
      borderColor: colors[i % colors.length],
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 2,
    };
  });
}
