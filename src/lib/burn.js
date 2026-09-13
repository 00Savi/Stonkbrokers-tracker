// Cumulative burn over each token's recorded life.
//
// Snapshots only started when the hourly job did (~2026-08-20 for brokers,
// ~2026-09-01 for specials). gg-index Transfer folds go back to first mint
// but have been overstating Mancer and even falling — a high index day
// must not freeze later live reads. Index (or activation volume) is only
// used before the first trusted snapshot, scaled to meet it. After that,
// snapshots and the live dual-burn read own the line. Quiet days carry
// the last cumulative forward — a burn cannot shrink.

import { usableSnapshots } from './snapshots';
import { windowLen } from './yieldHistory';
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
  let last = 0;
  const rows = [...(project?.dailySnapshots || [])].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  for (const s of rows) {
    const k = dateKey(s.date);
    const n = Number(s.tokenPriceUsd) || 0;
    if (n > 0 && n !== 0.03) last = n;
    if (k && last > 0) px[k] = last;
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

/** Labels and cumulative burn, windowed. Pass a project for full-life series. */
export function burnSeries(source, timeframe = 'all') {
  const filled = burnPath(asProject(source));
  const n = windowLen(timeframe, filled.labels.length);
  const labels = filled.labels.slice(-n);
  return {
    labels: formatLabels(labels),
    rawLabels: labels,
    data: filled.data.slice(-n),
  };
}

/**
 * Daily burn rate — first difference of the filled cumulative series.
 * Missing fetch days are 0 (carry), not a cliff.
 */
export function burnRateSeries(source, timeframe = 'all') {
  const project = asProject(source);
  const filled = burnPath(project);
  const n = windowLen(timeframe, filled.labels.length);
  const start = Math.max(0, filled.labels.length - n);
  const labels = filled.labels.slice(start);
  const vals = filled.data.slice(start);
  const px = priceByDate(project);
  let lastPx = 0;
  return {
    labels: formatLabels(labels),
    prices: labels.map((d) => {
      const nPx = Number(px[d]) || 0;
      if (nPx > 0) lastPx = nPx;
      return lastPx;
    }),
    burn: vals.map((v, i) => {
      const prior = i === 0
        ? (start > 0 ? Number(filled.data[start - 1]) : Number(v))
        : Number(vals[i - 1]);
      return (Number(v) || 0) - (Number(prior) || 0);
    }),
  };
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
