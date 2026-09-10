import { STREAM_COLORS, TIER_COLORS } from './charts';
import { trailingSnapshots, usableSnapshots } from './snapshots';

/** Yield / ROI chart windows. `all` is every usable snapshot we still have. */
export const YIELD_WINDOWS = [
  { id: '7d', label: 'Weekly', days: 7 },
  { id: '30d', label: 'Monthly', days: 30 },
  { id: 'all', label: 'All', days: 0 },
];

export const TIER_ROI_COLORS = TIER_COLORS;

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

export function mdKey(label) {
  const m = String(label || '').match(/(\d{1,2})\D+(\d{1,2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(label || '');
}

export function seriesHasInk(data) {
  return Array.isArray(data) && data.some((v) => v != null && Number(v) !== 0 && Number.isFinite(Number(v)));
}

function windowLookup(dates, arr) {
  const idx = new Map((dates || []).map((d, i) => [mdKey(d), i]));
  return (label) => {
    const j = idx.get(mdKey(label));
    if (j == null) return null;
    const n = Number(arr?.[j]);
    return Number.isFinite(n) ? n : 0;
  };
}

function pickNum(row, keys, fallback = null) {
  for (const k of keys) {
    if (row?.[k] == null) continue;
    const n = Number(row[k]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

const FEE_COL_META = [
  { key: 'amm', label: 'AMM & protocol', color: STREAM_COLORS.amm, snap: ['revAmm'], daily: 'dailyAmm', hist: 'historyAmm' },
  { key: 'dex', label: 'DEX fees', color: STREAM_COLORS.dex, snap: ['revDex'], daily: 'dailyDex', hist: 'historyDex' },
  { key: 'box', label: 'Clock-In / order', color: STREAM_COLORS.box, snap: ['revBox'], daily: 'dailySecurityBox', hist: 'historyBox' },
  { key: 'tax', label: 'Curve tax', color: STREAM_COLORS.tax, snap: ['revTax'], daily: 'dailyBondingTax', hist: 'historyTax' },
  { key: 'smartLp', label: 'StonkBroker Fees', color: STREAM_COLORS.smartLp, snap: ['revSmartLp'], daily: 'dailySmartLp', hist: 'historySmartLp' },
];

const VOLUME_META = {
  key: 'volume',
  label: 'Launch + bonding volume',
  color: STREAM_COLORS.volume,
  snap: ['revVolume'],
  daily: 'dailyLaunchpad',
  hist: 'historyVolume',
};

function streamOnLabels(labels, snaps, r, meta) {
  const shortDates = r.dailyDates || [];
  const shortLookup = windowLookup(shortDates, r[meta.daily]);
  const histArr = meta.hist === 'historyAmm'
    ? (r.historyAmm || r.historyTotalUsd || [])
    : (r[meta.hist] || []);
  const histLookup = windowLookup(r.historyDates || [], histArr);
  const byDate = new Map((snaps || []).map((s) => [mdKey(s.date), s]));
  return labels.map((d) => {
    const s = byDate.get(mdKey(d));
    const fromSnap = s ? pickNum(s, meta.snap) : null;
    if (fromSnap != null) return fromSnap;
    const fromWin = shortLookup(d);
    if (fromWin != null) return fromWin;
    const h = histLookup(d);
    if (h != null) return h;
    return null;
  });
}

/**
 * Date axis + stream columns for a project's revenue chart.
 * Snapshot dates are the axis when they outrun the 7-day walk, so Weekly /
 * Monthly / All actually differ. Volume is a separate column from protocol fees.
 */
export function protocolRevenueChart(project) {
  const ledger = project?.ledger;
  if (ledger?.historyDates?.length) {
    const n = ledger.historyDates.length;
    return {
      labels: ledger.historyDates,
      kind: 'ledger',
      cols: [
        { key: 'delivered', label: 'Delivered to members', color: STREAM_COLORS.delivered, data: padLeft(ledger.historyDelivered, n) },
        { key: 'vaulted', label: 'Still on the wall', color: STREAM_COLORS.vaulted, data: padLeft(ledger.historyVaulted, n) },
      ],
    };
  }

  const cf = project?.cashflow;
  if (cf?.dailyDates?.length) {
    const n = cf.dailyDates.length;
    return {
      labels: cf.dailyDates,
      kind: 'cashflow',
      cols: [
        { key: 'fees', label: 'Fees', color: STREAM_COLORS.fees, data: padLeft(cf.dailyFees, n) },
        { key: 'holders', label: 'Holders revenue', color: STREAM_COLORS.holdersRev, data: padLeft(cf.dailyRevenue, n) },
      ],
    };
  }

  const r = project?.revenue || {};
  const short = r.dailyDates?.length ? r.dailyDates : (project?.tiers?.[0]?.dailyDates || []);
  const snaps = usableSnapshots(project?.dailySnapshots);
  const snapLabels = snaps.map((s) => s.date).filter(Boolean);
  const labels = (() => {
    const hist = r.historyDates || [];
    if (snapLabels.length >= hist.length && snapLabels.length > short.length) return snapLabels;
    if (hist.length > snapLabels.length && hist.length > short.length) return hist;
    if (snapLabels.length > short.length) return snapLabels;
    if (hist.length) return hist;
    return short;
  })();
  const hasSmart = !!(r.smartLp || r.dailySmartLp?.length || snaps.some((s) => s.revSmartLp != null));
  const rWin = { ...r, dailyDates: short };

  const cols = FEE_COL_META
    .filter((m) => m.key !== 'smartLp' || hasSmart)
    .map((m) => ({
      key: m.key,
      label: m.label,
      color: m.color,
      data: streamOnLabels(labels, snaps, rWin, m),
    }));

  cols.push({
    key: VOLUME_META.key,
    label: VOLUME_META.label,
    color: VOLUME_META.color,
    data: streamOnLabels(labels, snaps, rWin, VOLUME_META),
  });

  return { labels, kind: 'protocol', cols };
}

export const FEE_KEYS = ['amm', 'dex', 'box', 'tax', 'smartLp', 'fees'];
export const VOLUME_KEYS = ['volume', 'launch'];

export function protocolFeeCols(cols) {
  return (cols || []).filter((c) => ['amm', 'dex', 'box', 'tax', 'smartLp'].includes(c.key));
}

export function volumeCols(cols) {
  return (cols || []).filter((c) => VOLUME_KEYS.includes(c.key));
}

export function mixPercentCols(cols) {
  const fees = protocolFeeCols(cols);
  const n = Math.max(0, ...fees.map((c) => (c.data || []).length));
  return fees.map((c) => ({
    ...c,
    data: Array.from({ length: n }, (_, i) => {
      const tot = fees.reduce((s, x) => s + (Number(x.data?.[i]) || 0), 0);
      return tot > 0 ? +(((Number(c.data?.[i]) || 0) / tot) * 100).toFixed(2) : null;
    }),
  }));
}

export function barDatasets(cols, { stacked = false } = {}) {
  return (cols || []).map((c) => ({
    label: c.label,
    data: c.data,
    backgroundColor: c.color,
    borderRadius: 3,
    maxBarThickness: stacked ? 36 : 22,
    skipNull: true,
    stack: stacked ? 'fees' : undefined,
  }));
}

export function tierRoiDatasets(snaps, tiers, { floorCostUsd = 0, tokenPriceUsd = 0, colors = TIER_ROI_COLORS } = {}) {
  return (tiers || []).map((t, i) => {
    const tc = floorCostUsd + (t.reqTokens || 0) * tokenPriceUsd;
    const currentRoi = tc > 0 && t.trackedAnnualYieldUsd > 0
      ? ((t.trackedAnnualYieldUsd / tc) * 100).toFixed(2)
      : '0.00';
    return {
      label: `${t.tier} ROI (${currentRoi}%)`,
      data: snaps.map((s) => {
        const roi = s.tiers?.find((st) => st.tier === t.tier)?.roi;
        if (roi == null) return null;
        const n = Number(roi);
        return Number.isFinite(n) ? n : null;
      }),
      borderColor: colors[i % colors.length],
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 2,
      spanGaps: true,
    };
  });
}

export function tierYieldUsdDatasets(snaps, tiers, { colors = TIER_ROI_COLORS } = {}) {
  return (tiers || []).map((t, i) => ({
    label: `${t.tier} yield (USD/yr)`,
    data: snaps.map((s) => {
      const y = s.tiers?.find((st) => st.tier === t.tier)?.yieldUsd;
      if (y == null) return null;
      const n = Number(y);
      return Number.isFinite(n) ? n : null;
    }),
    borderColor: colors[i % colors.length],
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 2,
    yAxisID: 'y',
    spanGaps: true,
  }));
}

export function tokenPriceDataset(snaps) {
  return {
    label: 'Token price (USD)',
    data: snaps.map((s) => {
      if (s.tokenPriceUsd == null) return null;
      const n = Number(s.tokenPriceUsd);
      return Number.isFinite(n) ? n : null;
    }),
    borderColor: '#94a3b8',
    borderDash: [4, 4],
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 0,
    yAxisID: 'y1',
    spanGaps: true,
  };
}

export function paybackYearDatasets(snaps, tiers, { floorCostUsd = 0, tokenPriceUsd = 0, colors = TIER_ROI_COLORS } = {}) {
  return (tiers || []).map((t, i) => ({
    label: `${t.tier} payback (years)`,
    data: snaps.map((s) => {
      const y = Number(s.tiers?.find((st) => st.tier === t.tier)?.yieldUsd) || 0;
      const floor = pickNum(s, ['nftFloorUsd']) ?? floorCostUsd;
      const px = Number(s.tokenPriceUsd) || tokenPriceUsd;
      const cost = floor + (t.reqTokens || 0) * px;
      if (!(y > 0) || !(cost > 0)) return null;
      return +(cost / y).toFixed(2);
    }),
    borderColor: colors[i % colors.length],
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 2,
    spanGaps: true,
  }));
}

export function tvlByModeFromVaults(vaults) {
  const o = { tvlFr: 0, tvlBb: 0, tvlAsk: 0 };
  for (const v of vaults || []) {
    const usd = Number(v.tvlUsd) || 0;
    if (v.mode === 0) o.tvlFr += usd;
    else if (v.mode === 1) o.tvlBb += usd;
    else if (v.mode === 2) o.tvlAsk += usd;
  }
  return o;
}

export function smartLpHistory(snaps, live = {}) {
  const last = snaps.length - 1;
  const tvl = snaps.map((s, i) => {
    const v = pickNum(s, ['smartLpTvl']);
    if (v != null) return v;
    if (i === last) return Number(live.totalTvlUsd) || 0;
    return null;
  });
  return {
    labels: snaps.map((s) => s.date),
    tvl,
    skim: snaps.map((s) => pickNum(s, ['revSmartLp', 'smartLpSkim'])),
    gross: snaps.map((s) => pickNum(s, ['revSmartLpGross', 'smartLpGross'])),
    fr: snaps.map((s, i) => pickNum(s, ['tvlFr']) ?? (i === last ? Number(live.tvlFr) || null : null)),
    bb: snaps.map((s, i) => pickNum(s, ['tvlBb']) ?? (i === last ? Number(live.tvlBb) || null : null)),
    ask: snaps.map((s, i) => pickNum(s, ['tvlAsk']) ?? (i === last ? Number(live.tvlAsk) || null : null)),
  };
}

export function lockedLpHistory(snaps, live = {}) {
  const last = snaps.length - 1;
  return {
    labels: snaps.map((s) => s.date),
    stonk: snaps.map((s, i) => {
      const v = pickNum(s, ['lockedStonk']);
      if (v != null) return v;
      if (i === last) return Number(live.totalStonkLocked) || 0;
      return null;
    }),
    usd: snaps.map((s, i) => {
      const v = pickNum(s, ['lockedLpUsd']);
      if (v != null) return v;
      if (i === last) return Number(live.totalLpUsd) || 0;
      return null;
    }),
  };
}

export function topPoolBars(pools, n = 10) {
  const rows = [...(pools || [])]
    .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
    .slice(0, n);
  return {
    labels: rows.map((p) => p.pairName || p.pair || 'Pool'),
    data: rows.map((p) => Number(p.liquidityUsd) || 0),
  };
}

export function pairTvlSlices(vaults, n = 8) {
  const map = new Map();
  for (const v of vaults || []) {
    const k = v.market || v.symbol || v.ca;
    map.set(k, (map.get(k) || 0) + (Number(v.tvlUsd) || 0));
  }
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, n);
  const rest = rows.slice(n).reduce((s, [, usd]) => s + usd, 0);
  const data = top.map(([label, value]) => ({ label, value }));
  if (rest > 0) data.push({ label: 'Other', value: +rest.toFixed(2) });
  return data;
}

export function tierActiveDatasets(snaps, tiers, liveBreakdown, colors = TIER_ROI_COLORS) {
  const last = snaps[snaps.length - 1];
  const live = liveBreakdown || last?.tierActive || {};
  return (tiers || []).map((t, i) => ({
    label: `${t.tier} ${t.name || ''}`.trim(),
    data: snaps.map((s, idx) => {
      const from = s.tierActive?.[t.tier];
      if (from != null) return Number(from) || 0;
      if (idx === snaps.length - 1) return Number(live[t.tier]) || 0;
      return null;
    }),
    backgroundColor: colors[i % colors.length],
    stack: 'tiers',
    maxBarThickness: 28,
  }));
}

export function ownershipHistory(snaps, live = {}) {
  const last = snaps.length - 1;
  return {
    labels: snaps.map((s) => s.date),
    token: snaps.map((s, i) => {
      const v = pickNum(s, ['tokenHolders']);
      if (v != null) return v;
      if (i === last) return Number(live.tokenHolders) || 0;
      return null;
    }),
    nft: snaps.map((s, i) => {
      const v = pickNum(s, ['nftHolders']);
      if (v != null) return v;
      if (i === last) return Number(live.nftHolders) || 0;
      return null;
    }),
    concentration: snaps.map((s, i) => {
      const v = pickNum(s, ['ownershipRatio']);
      if (v != null) return v;
      if (i === last) return Number(live.ownershipRatio) || 0;
      return null;
    }),
  };
}
