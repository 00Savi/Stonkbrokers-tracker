import { STREAM_COLORS, TIER_COLORS, barThickness } from './charts';
import { dateKey, formatLabels, utcIso } from './dates';
import { trailingSnapshots, usableSnapshots } from './snapshots';

/** Date range (how far back). Interval (Daily / Weekly / Monthly) is separate. */
export const YIELD_WINDOWS = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: 0 },
];

export const TIER_ROI_COLORS = TIER_COLORS;

function rangeDays(timeframe) {
  if (timeframe === '7d') return 7;
  if (timeframe === '30d') return 30;
  if (timeframe === '90d') return 90;
  return 0;
}

/** Monday-UTC week or YYYY-MM month. Daily keeps the calendar day. */
export function bucketKey(label, interval = 'daily') {
  const k = dateKey(label);
  if (!k || interval === 'daily') return k;
  if (interval === 'monthly') return k.slice(0, 7);
  const t = Date.parse(`${k}T00:00:00Z`);
  if (!Number.isFinite(t)) return k;
  const day = new Date(t).getUTCDay();
  const mon = new Date(t - ((day + 6) % 7) * 86400000);
  return mon.toISOString().slice(0, 10);
}

/**
 * Compress a daily series after the range slice.
 * `last` for levels (price, ROI, cumulative burn). `sum` for flows (fees, daily burn).
 */
export function resampleSeries(labels, values, interval = 'daily', mode = 'last') {
  const labs = labels || [];
  const vals = values || [];
  if (!interval || interval === 'daily' || labs.length < 2) {
    return { labels: labs, data: vals };
  }
  const order = [];
  const buckets = new Map();
  labs.forEach((lab, i) => {
    const key = bucketKey(lab, interval);
    if (!key) return;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key).push(Number(vals[i]));
  });
  return {
    labels: order,
    data: order.map((key) => {
      const nums = (buckets.get(key) || []).filter((n) => Number.isFinite(n));
      if (!nums.length) return null;
      if (mode === 'sum') return nums.reduce((s, n) => s + n, 0);
      if (mode === 'mean') return nums.reduce((s, n) => s + n, 0) / nums.length;
      return nums[nums.length - 1];
    }),
  };
}

export function windowSeries(labels, values, timeframe = 'all', interval = 'daily', mode = 'last') {
  const n = windowLen(timeframe, (labels || []).length);
  const labs = (labels || []).slice(-n);
  const vals = (values || []).slice(-n);
  return resampleSeries(labs, vals, interval, mode);
}

/**
 * Range + interval for aligned series (activation, holders).
 * `last` for levels, `sum` for daily flows.
 */
export function windowChart(labels, columns = [], timeframe = 'all', interval = 'daily', modes = []) {
  const source = labels || [];
  const n = windowLen(timeframe, source.length);
  const labs = source.slice(-n);
  const axis = resampleSeries(labs, labs, interval, 'last').labels;
  const cols = (columns || []).map((col, i) => (
    resampleSeries(labs, (col || []).slice(-n), interval, modes[i] || 'last').data
  ));
  return {
    labels: formatLabels(axis),
    rawLabels: axis,
    cols,
    points: axis.length,
  };
}

/** Usable snapshots for the selected range, then optional week/month buckets. */
export function windowSnapshots(snapshots, timeframe = 'all', interval = 'daily') {
  const sliced = trailingSnapshots(snapshots, rangeDays(timeframe));
  if (!interval || interval === 'daily') return sliced;
  const order = [];
  const buckets = new Map();
  for (const s of sliced) {
    const key = bucketKey(s.date, interval);
    if (!key) continue;
    if (!buckets.has(key)) order.push(key);
    buckets.set(key, s);
  }
  return order.map((key) => ({ ...buckets.get(key), date: key }));
}

export function windowLen(timeframe, total) {
  const n = Number(total) || 0;
  const days = rangeDays(timeframe);
  return days > 0 ? Math.min(days, n) : n;
}

export function windowPeriodLabel(timeframe) {
  if (timeframe === '7d') return '7D';
  if (timeframe === '30d') return '30D';
  if (timeframe === '90d') return '90D';
  return 'All';
}

/** Slice parallel date/value arrays to the range, then bucket flows. */
export function sliceCols(labels, cols, timeframe = 'all', interval = 'daily') {
  const n = windowLen(timeframe, (labels || []).length);
  const labs = (labels || []).slice(-n);
  return {
    labels: resampleSeries(labs, labs, interval, 'last').labels,
    cols: (cols || []).map((col) => {
      const sliced = (col.data || []).slice(-n);
      const resampled = resampleSeries(labs, sliced, interval, 'sum');
      return {
        ...col,
        data: resampled.data,
        total: resampled.data.reduce((s, v) => s + (Number(v) || 0), 0),
      };
    }),
  };
}

function padLeft(arr, n) {
  const a = Array.isArray(arr) ? arr.map((v) => Number(v) || 0) : [];
  if (a.length >= n) return a.slice(-n);
  return [...Array(Math.max(0, n - a.length)).fill(0), ...a];
}

/** Fill omitted calendar days so a sparse ledger still reaches today. */
function fillCalendar(isoLabels, seriesList, through = utcIso()) {
  const keys = (isoLabels || []).map((d) => dateKey(d)).filter(Boolean).sort();
  if (!keys.length) return { labels: isoLabels || [], series: seriesList };
  const start = Date.parse(`${keys[0]}T00:00:00Z`);
  const endKey = dateKey(through) > keys[keys.length - 1] ? dateKey(through) : keys[keys.length - 1];
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { labels: isoLabels || [], series: seriesList };
  }
  const idx = new Map(keys.map((d, i) => [d, i]));
  const labels = [];
  for (let t = start; t <= end; t += 86400000) {
    labels.push(new Date(t).toISOString().slice(0, 10));
  }
  const series = (seriesList || []).map((arr) => labels.map((d) => {
    const j = idx.get(d);
    if (j == null) return 0;
    const n = Number(arr?.[j]);
    return Number.isFinite(n) ? n : 0;
  }));
  return { labels, series };
}

export function mdKey(label) {
  return dateKey(label);
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
  { key: 'amm', label: 'AMM & swap rev', color: STREAM_COLORS.amm, snap: ['revAmm'], daily: 'dailyAmm', hist: 'historyAmm' },
  { key: 'dex', label: 'DEX rev', color: STREAM_COLORS.dex, snap: ['revDex'], daily: 'dailyDex', hist: 'historyDex' },
  { key: 'box', label: 'Clock-In / locker fees', color: STREAM_COLORS.box, snap: ['revBox'], daily: 'dailySecurityBox', hist: 'historyBox' },
  { key: 'tax', label: 'Snipe / curve tax', color: STREAM_COLORS.tax, snap: ['revTax'], daily: 'dailyBondingTax', hist: 'historyTax' },
  { key: 'booster', label: 'Partner Revenue Share', color: STREAM_COLORS.booster, snap: ['revBooster'], daily: 'dailyBooster', hist: 'historyBooster' },
  { key: 'smartLp', label: 'Smart LP Protocol Revenue', color: STREAM_COLORS.smartLp, snap: ['revSmartLp'], daily: 'dailySmartLp', hist: 'historySmartLp' },
];

const VOLUME_META = {
  key: 'volume',
  label: 'Launch + bonding volume',
  color: STREAM_COLORS.volume,
  snap: ['revVolume'],
  daily: 'dailyLaunchpad',
  hist: 'historyVolume',
};

/** UTC calendar days for the 7-day walk when `dailyDates` was not persisted. */
function liveWalkDates(r, meta) {
  if (meta?.key === 'smartLp' && r?.smartLp?.dailyDates?.length) return r.smartLp.dailyDates;
  if (r?.dailyDates?.length) return r.dailyDates;
  const n = Math.max(
    (r?.dailyAmm || []).length,
    (r?.dailySmartLp || []).length,
    (r?.dailySecurityBox || []).length,
  );
  if (!n) return [];
  // Align to historyDates, not browser "now". Synthesizing through today
  // slides yesterday's AMM onto today the moment UTC midnight hits and the
  // payload has not been refetched yet.
  const hist = (r.historyDates || []).map((d) => dateKey(d)).filter(Boolean);
  if (hist.length) return hist.slice(-n);
  const end = Date.parse(`${utcIso()}T00:00:00Z`);
  if (!Number.isFinite(end)) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(end - (n - 1 - i) * 86400000);
    return t.toISOString().slice(0, 10);
  });
}

function throughToday(labels) {
  const today = utcIso();
  const keys = [...new Set((labels || []).map((d) => dateKey(d)).filter(Boolean))];
  if (today && !keys.includes(today)) keys.push(today);
  return keys;
}

function streamOnLabels(labels, snaps, r, meta) {
  const shortDates = liveWalkDates(r, meta);
  const shortLookup = windowLookup(shortDates, r[meta.daily]);
  const histArr = meta.hist === 'historyAmm'
    ? (r.historyAmm || r.historyTotalUsd || [])
    : (r[meta.hist] || []);
  const histLookup = windowLookup(r.historyDates || [], histArr);
  const byDate = new Map((snaps || []).map((s) => [mdKey(s.date), s]));
  const today = utcIso();
  return labels.map((d) => {
    const fromWin = shortLookup(d);
    const s = byDate.get(mdKey(d));
    const fromSnap = s ? pickNum(s, meta.snap) : null;
    const h = histLookup(d);
    // In-progress UTC day: live oracle / FeesCollected walk, so each pull
    // fills the bar. A history 0 is "not printed yet" — keep the live walk
    // after midnight instead of waiting for gg-index to catch up. Completed
    // days with a real history print still prefer it so a job-clock bucket
    // cannot reprint yesterday as today. Smart LP history has been dropping
    // recent days, so that stream always prefers live.
    const historyEmpty = h == null || h === 0;
    const livePrinted = fromWin != null && fromWin !== 0;
    const liveFirst = meta.key === 'smartLp' || mdKey(d) === today || (historyEmpty && livePrinted);
    if (liveFirst) {
      if (fromWin != null) return fromWin;
      if (fromSnap != null) return fromSnap;
      if (h != null) return h;
      return null;
    }
    if (h != null) return h;
    if (fromWin != null) return fromWin;
    if (fromSnap != null) return fromSnap;
    return null;
  });
}

/**
 * Date axis + stream columns for a project's revenue chart.
 * Snapshot dates are the axis when they outrun the 7-day walk, so Weekly /
 * Monthly / All actually differ. Completed AMM / box / tax days prefer
 * gg-index history over the 7-day overlay so a job-clock bucket cannot
 * reprint yesterday as today — unless history is still 0, in which case the
 * live walk fills the bar until the index prints. Today's bar always uses
 * the live walk so each fetch fills in through the day. Smart LP prefers
 * live on every day.
 * Launch bonding volume is not a series here — it is swap notional, not
 * protocol-kept revenue.
 */
export function protocolRevenueChart(project) {
  const ledger = project?.ledger;
  if (ledger?.historyDates?.length) {
    const filled = fillCalendar(ledger.historyDates, [
      ledger.historyDelivered,
      ledger.historyVaulted,
    ]);
    const n = filled.labels.length;
    return {
      labels: formatLabels(filled.labels),
      rawLabels: filled.labels,
      kind: 'ledger',
      cols: [
        { key: 'delivered', label: 'Delivered to members', color: STREAM_COLORS.delivered, data: padLeft(filled.series[0], n) },
        { key: 'vaulted', label: 'Still on the wall', color: STREAM_COLORS.vaulted, data: padLeft(filled.series[1], n) },
      ],
    };
  }

  const cf = project?.cashflow;
  if (cf?.dailyDates?.length) {
    const n = cf.dailyDates.length;
    return {
      labels: formatLabels(cf.dailyDates),
      kind: 'cashflow',
      cols: [
        { key: 'fees', label: 'Protocol rev', color: STREAM_COLORS.fees, data: padLeft(cf.dailyFees, n) },
        { key: 'holders', label: 'Holders revenue', color: STREAM_COLORS.holdersRev, data: padLeft(cf.dailyRevenue, n) },
      ],
    };
  }

  const r = project?.revenue || {};
  const short = r.dailyDates?.length ? r.dailyDates : (project?.tiers?.[0]?.dailyDates || []);
  const snaps = usableSnapshots(project?.dailySnapshots);
  const snapLabels = snaps.map((s) => s.date).filter(Boolean);
  const labels = throughToday((() => {
    const hist = r.historyDates || [];
    if (snapLabels.length >= hist.length && snapLabels.length > short.length) return snapLabels;
    if (hist.length > snapLabels.length && hist.length > short.length) return hist;
    if (snapLabels.length > short.length) return snapLabels;
    if (hist.length) return hist;
    return short;
  })());
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

  // Nightshades 99% anti-snipe is curve withhold, not protocol-kept. A tax
  // bar that is a large fraction of the same day's bonding volume is that
  // withhold (and used to be stacked on top of the 13.33% StonkBooster cut).
  const vol = streamOnLabels(labels, snaps, rWin, VOLUME_META);
  const tax = cols.find((c) => c.key === 'tax');
  if (tax) {
    tax.data = tax.data.map((t, i) => {
      const n = Number(t);
      const v = Number(vol[i]);
      if (n > 0 && v > 0 && n > v * 0.2) return 0;
      return t;
    });
  }

  return { labels: formatLabels(labels), rawLabels: labels, kind: 'protocol', cols };
}

export const FEE_KEYS = ['amm', 'dex', 'box', 'tax', 'booster', 'smartLp', 'fees'];
export const VOLUME_KEYS = ['volume', 'launch'];

export function protocolFeeCols(cols) {
  return (cols || []).filter((c) => ['amm', 'dex', 'box', 'tax', 'booster', 'smartLp'].includes(c.key));
}

/**
 * USD paid to NFT / token holders that day.
 *
 * Brokers: per-NFT daily yield × active units at that tier.
 * Cashflow specials: `cashflow.dailyRevenue`.
 * Card Wall: delivered-to-members landed cost.
 */
export function holderRevenueOnLabels(project, labels) {
  const axis = labels || [];
  const cf = project?.cashflow;
  if (cf?.dailyDates?.length) {
    const lookup = windowLookup(cf.dailyDates, cf.dailyRevenue || []);
    return axis.map((d) => lookup(d) ?? 0);
  }
  const ledger = project?.ledger;
  if (ledger?.historyDates?.length) {
    const lookup = windowLookup(ledger.historyDates, ledger.historyDelivered || []);
    return axis.map((d) => lookup(d) ?? 0);
  }

  const r = project?.revenue || {};
  const holderHist = windowLookup(r.historyDates || [], r.historyHolder || []);
  const tiers = project?.tiers || [];
  const snaps = usableSnapshots(project?.dailySnapshots);
  const live = project?.activation?.breakdown || project?.activation?.byTier || {};
  const snapByDate = new Map(snaps.map((s) => [mdKey(s.date), s]));

  return axis.map((d) => {
    const fromHist = holderHist(d);
    if (fromHist > 0) return fromHist;
    const key = mdKey(d);
    const snap = snapByDate.get(key);
    let sum = 0;
    for (const t of tiers) {
      const dates = t.dailyDates || [];
      const i = dates.findIndex((x) => mdKey(x) === key);
      let perNft = i >= 0 ? Number(t.dailyYields?.[i]) || 0 : 0;
      if (!(perNft > 0)) {
        const y = Number(snap?.tiers?.find((st) => st.tier === t.tier)?.yieldUsd);
        if (y > 0) perNft = y / 365;
      }
      const active =
        Number(snap?.tierActive?.[t.tier]) ||
        Number(live[t.tier]) ||
        0;
      sum += perNft * active;
    }
    return sum;
  });
}

export function holderRevenueCol(project, rawLabels) {
  return {
    key: 'holders',
    label: 'Holder revenue',
    color: STREAM_COLORS.holdersRev,
    data: holderRevenueOnLabels(project, rawLabels || []),
  };
}

/**
 * CoC % from cashflow buckets. Oakmont (and any monthly indexer) publishes a
 * month total on the 1st — treating that as a daily print and ×365 is why
 * early Oakmont ROI printed ~1600%. Those series stay on the revenue chart.
 */
export function cashflowRoiByDate(p) {
  const cadence = String(p?.cashflow?.cadence || 'day').toLowerCase();
  if (cadence === 'month' || p?.config?.kind === 'vault') return {};
  const dates = p?.cashflow?.dailyDates || [];
  const revs = p?.cashflow?.dailyRevenue || [];
  const circ = Number(p?.ownership?.circulatingSupply) || 0;
  const price = Number(p?.market?.tokenPriceUsd) || 0;
  const req = Number(p?.tiers?.[0]?.reqTokens) || 0;
  const map = {};
  if (!dates.length || !(price > 0)) return map;
  dates.forEach((date, i) => {
    const day = Number(revs[i]) || 0;
    const cost = req > 0 ? req * price : circ * price;
    const annualForStake = circ > 0 && req > 0 ? day * (req / circ) * 365 : day * 365;
    map[date] = cost > 0 ? (annualForStake / cost) * 100 : null;
  });
  return map;
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
  const n = cols?.[0]?.data?.length || 0;
  const thick = barThickness(n);
  return (cols || []).map((c) => ({
    label: c.label,
    data: c.data,
    backgroundColor: c.color,
    borderRadius: n <= 16 ? 3 : 1,
    maxBarThickness: thick,
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
  const missZero = (v) => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const tvl = snaps.map((s, i) => {
    const v = missZero(pickNum(s, ['smartLpTvl']));
    if (v != null) return v;
    if (i === last) return missZero(live.totalTvlUsd);
    return null;
  });
  return {
    labels: formatLabels(snaps.map((s) => s.date)),
    tvl,
    skim: snaps.map((s) => pickNum(s, ['revSmartLp', 'smartLpSkim'])),
    gross: snaps.map((s) => pickNum(s, ['revSmartLpGross', 'smartLpGross'])),
    fr: snaps.map((s, i) => missZero(pickNum(s, ['tvlFr'])) ?? (i === last ? missZero(live.tvlFr) : null)),
    bb: snaps.map((s, i) => missZero(pickNum(s, ['tvlBb'])) ?? (i === last ? missZero(live.tvlBb) : null)),
    ask: snaps.map((s, i) => missZero(pickNum(s, ['tvlAsk'])) ?? (i === last ? missZero(live.tvlAsk) : null)),
  };
}

export function lockedLpHistory(snaps, live = {}) {
  const last = snaps.length - 1;
  return {
    labels: formatLabels(snaps.map((s) => s.date)),
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
    labels: formatLabels(snaps.map((s) => s.date)),
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
