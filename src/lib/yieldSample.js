import { useSyncExternalStore } from 'react';
import { yieldBook } from './books';
import { dateKey } from './dates';
import { typicalNightshadesSeat } from './nightshades';

/**
 * The run rate is trailing cash × 365 / days.
 *
 * The hourly walk still samples 7 days. This rescales the seat from the daily
 * book already on the page: the tier's own daily yield where that day was
 * walked, and the revenue history behind it when that history is the same
 * cash. A window the book does not cover leaves the published sample in place.
 */

export const YIELD_SAMPLE_WINDOWS = [
  { id: '7', label: 'Week', days: 7 },
  { id: '30', label: 'Month', days: 30 },
  { id: '90', label: 'Quarter', days: 90 },
];

export const DEFAULT_YIELD_SAMPLE = '30';
const STORAGE_KEY = 'yield-sample';

const listeners = new Set();
let sampleId = null;

function storedId() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return YIELD_SAMPLE_WINDOWS.some((w) => w.id === v) ? v : DEFAULT_YIELD_SAMPLE;
  } catch {
    return DEFAULT_YIELD_SAMPLE;
  }
}

function currentId() {
  if (!sampleId) sampleId = storedId();
  return sampleId;
}

export function yieldSampleDays(id = currentId()) {
  return YIELD_SAMPLE_WINDOWS.find((w) => w.id === id)?.days || 30;
}

export function yieldSampleLabel(id = currentId()) {
  return YIELD_SAMPLE_WINDOWS.find((w) => w.id === id)?.label || 'Month';
}

export function setYieldSampleId(id) {
  if (!YIELD_SAMPLE_WINDOWS.some((w) => w.id === id) || id === currentId()) return;
  sampleId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode still toggles for this tab */
  }
  listeners.forEach((fn) => fn());
}

export function useYieldSampleId() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    currentId,
    () => DEFAULT_YIELD_SAMPLE,
  );
}

function seriesFrom(dates, values) {
  const map = new Map();
  (dates || []).forEach((d, i) => {
    const k = dateKey(d);
    const raw = values?.[i];
    if (!k || raw == null || raw === '') return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    map.set(k, n);
  });
  return map;
}

function fillGaps(map) {
  const keys = [...map.keys()].sort();
  if (keys.length < 2) return map;
  const start = Date.parse(`${keys[0]}T00:00:00Z`);
  const end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return map;
  const out = new Map(map);
  for (let t = start; t <= end; t += 86400000) {
    const k = new Date(t).toISOString().slice(0, 10);
    if (!out.has(k)) out.set(k, 0);
  }
  return out;
}

function spanDays(map) {
  const keys = [...map.keys()].sort();
  if (!keys.length) return 0;
  const a = Date.parse(`${keys[0]}T00:00:00Z`);
  const b = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return keys.length;
  return Math.round((b - a) / 86400000) + 1;
}

/** Sum of `days` calendar days ending on the last point, annualized. Null when a day is missing. */
export function trailingAnnual(map, days) {
  const keys = [...map.keys()].sort();
  if (!keys.length || !(days > 0)) return null;
  const end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  if (!Number.isFinite(end)) return null;
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const k = new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    if (!map.has(k)) return null;
    sum += Number(map.get(k)) || 0;
  }
  return sum * (365 / days);
}

function networkWeight(project) {
  const br = project?.activation?.breakdown || {};
  let tw = 0;
  for (const t of project?.tiers || []) {
    tw += (Number(br[t.tier]) || 0) * (Number(t.weight) || 0);
  }
  return tw;
}

/**
 * `amm` when history AMM allocates onto the walked daily yield.
 * `both` when Mancer-style seats also earn the DEX leg.
 * Null when the history is a different book and must not extend the seat.
 */
function streamMode(direct, amm, dex, weight, tw) {
  if (!(tw > 0) || !(weight > 0)) return null;
  let n = 0;
  let ammErr = 0;
  let bothErr = 0;
  for (const [day, y] of direct) {
    if (!(y > 0) || !amm.has(day)) continue;
    const a = (amm.get(day) * weight) / tw;
    const b = ((amm.get(day) + (dex.get(day) || 0)) * weight) / tw;
    ammErr += Math.abs(a - y) / y;
    bothErr += Math.abs(b - y) / y;
    n += 1;
  }
  if (n < 3) return null;
  const meanA = ammErr / n;
  const meanB = bothErr / n;
  if (meanA <= 0.08) return 'amm';
  if (meanB <= 0.08 && meanB < meanA) return 'both';
  return null;
}

function yieldPool(project) {
  const rev = project?.revenue || {};
  const paid = seriesFrom(rev.historyDates, rev.historyPaid);
  const pot = seriesFrom(rev.historyDates, rev.historyFloat);
  const amm = seriesFrom(rev.historyDates, rev.historyAmm);
  const dex = seriesFrom(rev.historyDates, rev.historyDex);
  const pool = new Map(amm);
  for (const [day, value] of pot) pool.set(day, value);
  for (const [day, value] of paid) pool.set(day, value);
  return { pool, dex };
}

function seatMap(project, tier) {
  const direct = seriesFrom(tier?.dailyDates, tier?.dailyYields);
  const { pool, dex } = yieldPool(project);
  const weight = Number(tier?.weight) || 0;
  const tw = networkWeight(project);
  const detected = streamMode(direct, pool, dex, weight, tw);
  const mode = yieldBook(project) === 'float' && detected === 'both' ? 'amm' : detected;
  const out = new Map(direct);
  if (mode && tw > 0 && weight > 0) {
    for (const [day, net] of pool) {
      if (out.has(day)) continue;
      const cash = mode === 'both' ? net + (dex.get(day) || 0) : net;
      out.set(day, (cash * weight) / tw);
    }
  }
  return out;
}

/** Cash that seat was actually paid, before the earning-seat scale. */
export function seatCashByDate(project, tier) {
  if (!project || !tier) return new Map();
  const kind = project.config?.kind;
  if (kind === 'cashflow') {
    const circ = Number(project.ownership?.circulatingSupply) || 0;
    const req = Number(tier.reqTokens) || 0;
    const map = seriesFrom(project.cashflow?.dailyDates, project.cashflow?.dailyRevenue);
    if (!(circ > 0) || !(req > 0)) return new Map();
    for (const [day, value] of map) map.set(day, (value * req) / circ);
    return map;
  }
  if (kind === 'brokers') {
    const map = seriesFrom(tier.dailyDates, tier.dailyYields);
    const n = Number(project.activation?.activeCount) || 0;
    if (!(n > 0)) return new Map();
    for (const [day, value] of map) map.set(day, value / n);
    return map;
  }
  return seatMap(project, tier);
}

function markTier(project, tier, annual) {
  const px = Number(project?.market?.tokenPriceUsd) || 0;
  const eth = Number(project?.market?.ethPriceUsd) || 0;
  const floor = Number(tier.entryUsd) > 0
    ? Number(tier.entryUsd)
    : (Number(tier.floorEth) || Number(project?.market?.nftFloorEth) || 0) * eth
      + (Number(tier.reqTokens) || 0) * px;
  return {
    ...tier,
    publishedAnnualYieldUsd: Number(tier.trackedAnnualYieldUsd) || 0,
    trackedAnnualYieldUsd: annual,
    currentRoi: floor > 0 && annual > 0 ? +((annual / floor) * 100).toFixed(2) : 0,
  };
}

function sampleMeta(id, days, { applied, have, partial = null }) {
  return { id, days, label: yieldSampleLabel(id), applied, have, partial };
}

function untouched(project, id, days, have = 0) {
  return {
    ...project,
    yieldSample: sampleMeta(id, days, { applied: false, have }),
  };
}

function stakeShare(project, tier) {
  const pool = Number(project?.revenue?.holderStaking30dUsd) || 0;
  if (!(pool > 0)) return 0;
  const br = project?.activation?.breakdown || {};
  let stakeW = 0;
  for (const t of project?.tiers || []) {
    stakeW += (Number(br[t.tier]) || 0) * (Number(t.weight) || 0);
  }
  if (!(stakeW > 0)) return 0;
  return pool * (365 / 30) * ((Number(tier.weight) || 0) / stakeW);
}

function earnerFactor(project) {
  const row = project?.effective;
  if (!row?.holds_ready) return null;
  const counted = Number(row.counted);
  const still = Number(row.still_with_activator);
  if (!(still > 0) || !(counted > still)) return null;
  return { counted, still, scale: counted / still };
}

function scaleBuilt(project, built) {
  const earners = earnerFactor(project);
  if (!earners || !built?.tiers?.length) return built;
  return {
    ...built,
    tiers: built.tiers.map((tier) => {
      const shown = Number(tier.trackedAnnualYieldUsd) || 0;
      if (!(shown > 0)) return tier;
      const published = tier.publishedAnnualYieldUsd != null
        ? Number(tier.publishedAnnualYieldUsd)
        : shown;
      return markTier(project, { ...tier, trackedAnnualYieldUsd: published }, shown * earners.scale);
    }),
    yieldSample: {
      ...(built.yieldSample || {}),
      earners: { counted: earners.counted, still: earners.still },
    },
  };
}

function applyCardwall(project, id, days) {
  const tiers = project?.tiers || [];
  if (!tiers.length) return scaleBuilt(project, untouched(project, id, days, 0));
  const maps = tiers.map((t) => seriesFrom(t.dailyDates, t.dailyYields));
  const have = Math.max(0, ...maps.map(spanDays));
  const rains = maps.map((m) => trailingAnnual(m, days));
  if (rains.some((n) => n == null)) return scaleBuilt(project, untouched(project, id, days, have));
  const partial = days === 30 ? null : 'rain';
  return scaleBuilt(project, {
    ...project,
    tiers: tiers.map((t, i) => {
      const stake = days === 30 ? stakeShare(project, t) : 0;
      return markTier(project, t, rains[i] + stake);
    }),
    yieldSample: sampleMeta(id, days, { applied: true, have, partial }),
  });
}

function applyPool(project, id, days, { perUnit, fill = false }) {
  const tier = project?.tiers?.[0];
  if (!tier) return untouched(project, id, days, 0);
  const map = fill
    ? fillGaps(seriesFrom(tier.dailyDates, tier.dailyYields))
    : seriesFrom(tier.dailyDates, tier.dailyYields);
  const have = spanDays(map);
  const pool = trailingAnnual(map, days);
  const scale = perUnit(project, tier);
  if (pool == null || !(scale > 0)) return untouched(project, id, days, have);
  const annual = pool * scale;
  return {
    ...project,
    tiers: project.tiers.map((t, i) => (
      i === 0 ? markTier(project, t, annual) : t
    )),
    yieldSample: sampleMeta(id, days, { applied: true, have }),
  };
}

function applyAnvil(project, id, days) {
  const tiers = project?.tiers || [];
  if (!tiers.length) return scaleBuilt(project, untouched(project, id, days, 0));
  const maps = tiers.map((t) => seatMap(project, t));
  const have = Math.max(0, ...maps.map(spanDays));
  const annuals = maps.map((m) => trailingAnnual(m, days));
  if (annuals.some((n) => n == null)) return scaleBuilt(project, untouched(project, id, days, have));
  return scaleBuilt(project, {
    ...project,
    tiers: tiers.map((t, i) => markTier(project, t, annuals[i])),
    yieldSample: sampleMeta(id, days, { applied: true, have }),
  });
}

function applyOne(project, id, days, key) {
  if (!project) return project;
  const tagged = project.bookSlug === key ? project : { ...project, bookSlug: key };
  const kind = tagged.config?.kind;
  if (kind === 'machines' || kind === 'vault') return untouched(tagged, id, days, 0);
  if (key === 'cardwall') return applyCardwall(tagged, id, days);
  if (kind === 'cashflow') {
    return applyPool(tagged, id, days, {
      perUnit: (p, t) => {
        const circ = Number(p.ownership?.circulatingSupply) || 0;
        const req = Number(t.reqTokens) || 0;
        return circ > 0 && req > 0 ? req / circ : 0;
      },
    });
  }
  if (kind === 'brokers') {
    return applyPool(tagged, id, days, {
      fill: true,
      perUnit: (p) => {
        const n = Number(p.activation?.activeCount) || 0;
        return n > 0 ? 1 / n : 0;
      },
    });
  }
  if (kind === 'factions' && tagged.factions) {
    const factions = {};
    let have = 0;
    let applied = true;
    let partial = null;
    for (const [fid, fp] of Object.entries(tagged.factions)) {
      factions[fid] = applyOne(fp, id, days, fid);
      have = Math.max(have, factions[fid]?.yieldSample?.have || 0);
      if (!factions[fid]?.yieldSample?.applied) applied = false;
      partial = partial || factions[fid]?.yieldSample?.partial || null;
    }
    const next = { ...tagged, factions };
    if (applied) {
      next.tiers = (tagged.tiers || []).map((t) => {
        const seat = typicalNightshadesSeat(factions, t.tier);
        return {
          ...t,
          publishedAnnualYieldUsd: Number(t.trackedAnnualYieldUsd) || 0,
          trackedAnnualYieldUsd: seat.annual,
          currentRoi: seat.roi,
        };
      });
    }
    next.yieldSample = sampleMeta(id, days, { applied, have, partial });
    return next;
  }
  return applyAnvil(tagged, id, days);
}

export function applyYieldSample(data, id = DEFAULT_YIELD_SAMPLE) {
  if (!data?.projects) return data;
  const days = yieldSampleDays(id);
  const projects = {};
  for (const [key, project] of Object.entries(data.projects)) {
    projects[key] = applyOne(project, id, days, key);
  }
  return { ...data, projects, yieldSample: { id, days, label: yieldSampleLabel(id) } };
}

function seatsText(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

function earnerSentence(project) {
  const own = project?.yieldSample?.earners;
  if (own?.still > 0 && own.counted > own.still) {
    return ` Split across ${seatsText(own.still)} seats still earning. The contract counts ${seatsText(own.counted)}.`;
  }
  const kids = Object.values(project?.factions || {})
    .map((faction) => faction?.yieldSample?.earners)
    .filter((row) => row?.still > 0 && row.counted > row.still);
  if (!kids.length) return '';
  return ' Each faction is split across seats still earning. The contract count includes seats that have moved.';
}

export function yieldBasisText(project) {
  const s = project?.yieldSample;
  const extra = earnerSentence(project);
  if (!s) return `Trailing cash annualized over the selected run rate.${extra}`;
  if (!s.applied) {
    if (s.have > 0) return `Published sample. The daily book covers ${s.have} days.${extra}`;
    return `Published sample. This seat has no daily book for a longer window.${extra}`;
  }
  if (s.partial === 'rain') {
    return `${s.label} slab rain, annualized. Staking is a 30-day figure, so it joins the Month rate.${extra}`;
  }
  return `${s.label} trailing cash, annualized × 365/${s.days}.${extra}`;
}
