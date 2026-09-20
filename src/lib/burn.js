// Cumulative burn over each token's recorded life.
//
// Snapshots only started when the hourly job did (~2026-08-20 for brokers,
// ~2026-09-01 for specials). clock_in ROI rows are not supply reads.
// Transfer-fold / gg-index burnHistory fills days before the first trusted
// snapshot, scaled to meet it. After that, snapshots and the live dual-burn
// read own the line. Quiet days carry the last cumulative forward — a burn
// cannot shrink.

import { usableSnapshots } from './snapshots';
import { resampleSeries, windowLen } from './yieldHistory';
import { dateKey, formatLabels, utcIso } from './dates';

function asProject(source) {
  if (source && !Array.isArray(source) && (source.dailySnapshots || source.activation || source.ownership)) {
    return source;
  }
  return { dailySnapshots: Array.isArray(source) ? source : [] };
}

function liveBurn(p) {
  return Math.max(
    Number(p?.activation?.dualBurn?.totalBurnTokens) || 0,
    Number(p?.ownership?.permanentlyBurntTokens) || 0,
  );
}

function snapshotBurnMap(snaps) {
  const map = {};
  for (const s of usableSnapshots(snaps)) {
    // clock_in rows exist for pre-oracle ROI. The revenue backfill copied
    // the first live burn onto every one of them, which flattened the
    // chart until hourly snapshots started. Ignore those placeholders;
    // burnHistory from the Transfer fold owns the days before the first
    // trusted supply read.
    if (s?.yieldSource === 'clock_in') continue;
    const k = dateKey(s.date);
    const n = Number(s.totalBurn);
    if (k && Number.isFinite(n) && n > 0) map[k] = n;
  }
  return map;
}

/** gg-index Transfer fold, from first mint. */
function indexBurnMap(project) {
  const hist = project?.ownership?.burnHistory;
  const labels = hist?.labels || [];
  const data = hist?.data || [];
  const map = {};
  labels.forEach((d, i) => {
    const k = dateKey(d);
    const n = Number(data[i]);
    if (k && Number.isFinite(n) && n > 0) map[k] = n;
  });
  return map;
}

/** Days before the first snapshot, inferred from activation volume. */
function activationBurnGuess(project, snapMap) {
  const labels = project?.activation?.history?.labels || [];
  const gross = project?.activation?.history?.cumulativeGross || [];
  if (!labels.length || gross.length !== labels.length) return {};
  const firstSnap = Object.keys(snapMap).sort()[0];
  if (!firstSnap) return {};
  let grossAtFirst = 0;
  labels.forEach((d, i) => {
    if (dateKey(d) <= firstSnap) grossAtFirst = Number(gross[i]) || 0;
  });
  const firstBurn = Number(snapMap[firstSnap]) || 0;
  if (!(grossAtFirst > 0) || !(firstBurn > 0)) return {};
  const per = firstBurn / grossAtFirst;
  const map = {};
  labels.forEach((d, i) => {
    const k = dateKey(d);
    const g = Number(gross[i]) || 0;
    if (k && k < firstSnap && g > 0) map[k] = g * per;
  });
  return map;
}

function fillCarry(map, through = utcIso()) {
  const keys = Object.keys(map).filter(Boolean).sort();
  if (!keys.length) return { labels: [], data: [] };
  const start = Date.parse(`${keys[0]}T00:00:00Z`);
  const lastKey = keys[keys.length - 1];
  const endKey = dateKey(through) > lastKey ? dateKey(through) : lastKey;
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { labels: keys, data: keys.map((k) => map[k]) };
  }
  const labels = [];
  const data = [];
  let last = null;
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    labels.push(d);
    const n = Number(map[d]);
    if (Number.isFinite(n) && n > 0) {
      last = data.length && n < data[data.length - 1] ? data[data.length - 1] : n;
    }
    data.push(last);
  }
  return { labels, data };
}

function priceByDate(project) {
  const px = {};
  // Pool daily closes from first mint. clock_in snapshots used to carry the
  // first hourly DexScreener print backward, which flattened the flywheel.
  const hist = project?.ownership?.priceHistory;
  const hLabels = hist?.labels || [];
  const hData = hist?.data || [];
  hLabels.forEach((d, i) => {
    const k = dateKey(d);
    const n = Number(hData[i]);
    if (k && n > 0 && n !== 0.03) px[k] = n;
  });

  const rows = [...(project?.dailySnapshots || [])].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  for (const s of rows) {
    const k = dateKey(s.date);
    const n = Number(s.tokenPriceUsd) || 0;
    // clock_in used to copy the first DexScreener print onto every earlier
    // day. Prefer priceHistory for those dates; use the row only when the
    // backfill has replaced the placeholder and history is missing.
    if (s?.yieldSource === 'clock_in' && px[k]) continue;
    if (k && n > 0 && n !== 0.03) px[k] = n;
  }
  const live = Number(project?.market?.tokenPriceUsd) || 0;
  if (live > 0) px[utcIso()] = live;
  return px;
}

function lastValue(map, before) {
  const keys = Object.keys(map)
    .filter((k) => !before || k < before)
    .sort();
  const k = keys[keys.length - 1];
  return k ? Number(map[k]) || 0 : 0;
}

function scaleMap(map, factor) {
  if (!(factor > 0) || factor === 1) return { ...map };
  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = Number(v) * factor;
  return out;
}

function burnPath(project) {
  const snapMap = snapshotBurnMap(project.dailySnapshots);
  const histMap = indexBurnMap(project);
  const live = liveBurn(project);
  const today = utcIso();
  const firstSnap = Object.keys(snapMap).sort()[0];
  const map = {};

  if (firstSnap) {
    const firstBurn = Number(snapMap[firstSnap]) || 0;
    const preHist = {};
    for (const [k, v] of Object.entries(histMap)) {
      if (k < firstSnap && v > 0) preHist[k] = v;
    }
    const preGuess = activationBurnGuess(project, { [firstSnap]: firstBurn });
    // Index owns days it actually recorded. Activation volume only fills
    // holes before the first snapshot.
    const pre = { ...preGuess, ...preHist };
    const preEnd = lastValue(pre, firstSnap);
    // Index fold has been running ahead of the live dual-burn read. Scale
    // the pre-snapshot days down to the first trusted snapshot so the line
    // never drops at the stitch, then snapshots own every day after.
    const scaled = preEnd > firstBurn && firstBurn > 0 ? scaleMap(pre, firstBurn / preEnd) : pre;
    Object.assign(map, scaled, snapMap);
  } else if (live > 0) {
    const lastHist = lastValue(histMap);
    const scaled = lastHist > live ? scaleMap(histMap, live / lastHist) : histMap;
    Object.assign(map, scaled);
  } else {
    Object.assign(map, histMap);
  }

  if (live > 0) {
    const lastSnap = Object.keys(snapMap).sort().pop();
    const floor = lastSnap ? Number(snapMap[lastSnap]) || 0 : 0;
    // Live read is current truth. Do not raise it to a stale index peak.
    map[today] = Math.max(live, floor);
  }
  return fillCarry(map, today);
}

export function internActivationBurn(intern) {
  return Math.max(
    Number(intern?.activation?.dualBurn?.totalBurnTokens) || 0,
    Number(intern?.ownership?.permanentlyBurntTokens) || 0,
  );
}

/** Live split: intern activation fees vs the rest of $STONKBROKER destroyed. */
export function attributedStonkBurn(stonk, intern) {
  const total = liveBurn(stonk);
  const internBurn = internActivationBurn(intern);
  return {
    total,
    intern: internBurn,
    brokers: Math.max(0, total - internBurn),
  };
}

function carryAt(labels, values, day) {
  const k = dateKey(day);
  let last = 0;
  for (let i = 0; i < (labels || []).length; i++) {
    const d = dateKey(labels[i]);
    if (d <= k && values[i] != null) last = Number(values[i]) || 0;
    if (d === k) return Number(values[i]) || last;
  }
  return last;
}

/** First UTC day an intern activated. Empty when that history is not in yet. */
export function firstInternActivationDay(intern) {
  const labels = intern?.activation?.history?.labels || [];
  const daily = intern?.activation?.history?.dailyActivations || [];
  for (let i = 0; i < labels.length; i++) {
    if ((Number(daily[i]) || 0) > 0) return dateKey(labels[i]);
  }
  const snaps = [...(intern?.dailySnapshots || [])].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  for (const s of snaps) {
    if ((Number(s.activeCount) || 0) > 0 || (Number(s.totalBurn) || 0) > 0) return dateKey(s.date);
  }
  return '';
}

function alignedInternCumulative(stonk, intern) {
  const totalFilled = burnPath(asProject(stonk));
  const internFilled = intern ? burnPath(asProject(intern)) : { labels: [], data: [] };
  const internCum = (totalFilled.labels || []).map((d) => carryAt(internFilled.labels, internFilled.data, d));
  const liveIntern = internActivationBurn(intern);
  if (liveIntern > 0 && internCum.length) {
    internCum[internCum.length - 1] = Math.max(internCum[internCum.length - 1] || 0, liveIntern);
  }
  return { totalFilled, internCum };
}

/**
 * Token-wide burn plus intern-activation burn, aligned on the same days.
 * Interns start at mint; earlier days are 0 intern / all brokers.
 */
export function splitBurnSeries(stonk, intern, timeframe = 'all') {
  const total = burnSeries(stonk, timeframe);
  const { internCum } = alignedInternCumulative(stonk, intern);
  const byDay = new Map((burnPath(asProject(stonk)).labels || []).map((d, i) => [dateKey(d), internCum[i] || 0]));
  const internAligned = (total.rawLabels || []).map((d) => Number(byDay.get(dateKey(d))) || 0);
  return {
    ...total,
    intern: internAligned,
    brokers: total.data.map((t, i) => Math.max(0, (Number(t) || 0) - (internAligned[i] || 0))),
  };
}

/**
 * Daily intern vs broker $STONKBROKER burn, from the first intern activation.
 * Timeframe still windows the tail (weekly / monthly / all).
 */
export function dailyAttributedBurnSeries(stonk, intern, timeframe = 'all', interval = 'daily') {
  const startDay = firstInternActivationDay(intern);
  if (!startDay) return { startDay: '', labels: [], rawLabels: [], intern: [], brokers: [] };

  const { totalFilled, internCum } = alignedInternCumulative(stonk, intern);
  const startIdx = (totalFilled.labels || []).findIndex((d) => dateKey(d) >= startDay);
  if (startIdx < 0) return { startDay, labels: [], rawLabels: [], intern: [], brokers: [] };

  const labels = totalFilled.labels.slice(startIdx);
  const totalCum = totalFilled.data.slice(startIdx);
  const internSlice = internCum.slice(startIdx);
  const priorTotal = startIdx > 0 ? Number(totalFilled.data[startIdx - 1]) || 0 : 0;
  const priorIntern = startIdx > 0 ? Number(internCum[startIdx - 1]) || 0 : 0;

  const internDaily = internSlice.map((v, i) => {
    const prev = i === 0 ? priorIntern : Number(internSlice[i - 1]) || 0;
    return Math.max(0, (Number(v) || 0) - prev);
  });
  const totalDaily = totalCum.map((v, i) => {
    const prev = i === 0 ? priorTotal : Number(totalCum[i - 1]) || 0;
    return Math.max(0, (Number(v) || 0) - prev);
  });
  const brokersDaily = totalDaily.map((t, i) => Math.max(0, t - (internDaily[i] || 0)));

  const n = windowLen(timeframe, labels.length);
  const labs = labels.slice(-n);
  const internWin = internDaily.slice(-n);
  const brokerWin = brokersDaily.slice(-n);
  const internRes = resampleSeries(labs, internWin, interval, 'sum');
  const brokerRes = resampleSeries(labs, brokerWin, interval, 'sum');
  return {
    startDay,
    labels: formatLabels(internRes.labels),
    rawLabels: internRes.labels,
    intern: internRes.data,
    brokers: brokerRes.data,
  };
}

/** Labels and cumulative burn, windowed. Pass a project for full-life series. */
export function burnSeries(source, timeframe = 'all', interval = 'daily') {
  const filled = burnPath(asProject(source));
  const n = windowLen(timeframe, filled.labels.length);
  const labels = filled.labels.slice(-n);
  const resampled = resampleSeries(labels, filled.data.slice(-n), interval, 'last');
  return {
    labels: formatLabels(resampled.labels),
    rawLabels: resampled.labels,
    data: resampled.data,
  };
}

/**
 * Daily burn rate — first difference of the filled cumulative series.
 * Missing fetch days are 0 (carry), not a cliff.
 */
export function burnRateSeries(source, timeframe = 'all', interval = 'daily') {
  const project = asProject(source);
  const filled = burnPath(project);
  const n = windowLen(timeframe, filled.labels.length);
  const start = Math.max(0, filled.labels.length - n);
  const labels = filled.labels.slice(start);
  const vals = filled.data.slice(start);
  const px = priceByDate(project);
  let lastPx = 0;
  const prices = labels.map((d) => {
    const nPx = Number(px[d]) || 0;
    if (nPx > 0) lastPx = nPx;
    return lastPx;
  });
  const burn = vals.map((v, i) => {
    const prior = i === 0
      ? (start > 0 ? Number(filled.data[start - 1]) : Number(v))
      : Number(vals[i - 1]);
    return (Number(v) || 0) - (Number(prior) || 0);
  });
  const burnRes = resampleSeries(labels, burn, interval, 'sum');
  const pxRes = resampleSeries(labels, prices, interval, 'last');
  return {
    labels: formatLabels(burnRes.labels),
    prices: pxRes.data,
    burn: burnRes.data,
    burnAxisMax: timeframe === 'all' && interval === 'daily' ? robustBurnAxisMax(burnRes.data) : undefined,
  };
}

/**
 * Launch-week burns ran 10M–160M (activation lock + dead-address sinks).
 * Those only appear on ALL and flatten every later bar. Weekly / Monthly
 * leave Chart.js to scale to the window. ALL uses the tallest day under
 * 10M, with a little headroom.
 */
export const MEGA_BURN_AXIS = 10_000_000;

export function robustBurnAxisMax(values) {
  const all = (values || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!all.length) return undefined;
  const typical = all.filter((n) => n < MEGA_BURN_AXIS);
  if (!typical.length) return undefined;
  const cap = Math.max(...typical);
  const peak = Math.max(...all);
  if (!(peak > cap) || !(cap > 0)) return undefined;
  return cap * 1.08;
}

/** Token-unit cap used for "burnt ÷ total supply". */
export function tokenSupplyCap(project) {
  const unit = Number(project?.config?.unitValue) || 1;
  const nftOrMax =
    Number(project?.activation?.totalSupply) ||
    Number(project?.config?.maxSupply) ||
    Number(project?.ownership?.currentMaxSupply) ||
    0;
  const circ = Number(project?.ownership?.circulatingSupply) || 0;
  const burnt = liveBurn(project);
  if (unit > 1 && nftOrMax > 0 && nftOrMax < 1e6) return nftOrMax * unit;
  if (circ > 0) return Math.max(circ + burnt, nftOrMax);
  return nftOrMax > 0 ? nftOrMax : 0;
}

/** Burnt tokens as a percent of total supply, or null when we cannot say. */
export function burnOfSupplyPct(project, burntTokens) {
  const burnt = Number(burntTokens);
  const cap = tokenSupplyCap(project);
  if (!(burnt > 0) || !(cap > 0)) return null;
  return (burnt / cap) * 100;
}
