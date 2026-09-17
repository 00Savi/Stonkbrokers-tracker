/** Nightshades is one dashboard project and four gg-index slugs. */

import { dateKey, formatLabels } from './dates';
import { protocolFeeCols, protocolRevenueChart, seriesHasInk, windowLen } from './yieldHistory';

export const NIGHTSHADES_FACTIONS = ['ghosts', 'zombies', 'knights', 'watchers'];

export const NIGHTSHADES_FACTION_META = [
  { id: 'ghosts', label: 'Ghosts', ticker: 'GHOSTS' },
  { id: 'zombies', label: 'Zombies', ticker: 'ZOMBIES' },
  { id: 'knights', label: 'Knights', ticker: 'KNIGHTS' },
  { id: 'watchers', label: 'Watchers', ticker: 'WATCHERS' },
];

export function factionLabel(id) {
  return NIGHTSHADES_FACTION_META.find((f) => f.id === id)?.label || id;
}

export function factionList(ids) {
  if (!ids?.length) return '—';
  return ids.map(factionLabel).join(' + ');
}

/** Daily pool-WETH series for the Night LP health chart. Falls back to the live stamp. */
export function nightLpPoints(night) {
  const hist = Array.isArray(night?.lpHistory) ? night.lpHistory.filter((r) => r && r.date) : [];
  if (hist.length) return hist;
  const total = Number(night?.poolsWeth);
  if (!(total > 0) && !night?.pools) return [];
  return [{
    date: night?.history?.[(night.history || []).length - 1]?.date || 'live',
    nightId: night?.nightId,
    totalWeth: total || 0,
    totalUsd: Number(night?.poolsWethUsd) || 0,
    pools: night?.pools || {},
  }];
}

export function formatNightClock(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${day} ${hh}:${mm} UTC`;
}

export function nightPhaseLabel(phase) {
  return {
    open: 'Window open',
    moving: 'LP moving',
    settled: 'Settled',
    awaiting: 'Until next night',
    idle: 'Idle',
  }[phase] || phase || '—';
}

export function nightMagnitudePct(bps) {
  const n = Number(bps);
  return Number.isFinite(n) ? `${(n / 100).toFixed(2)}%` : '—';
}

/** How often a faction was favored vs struck across completed nights. */
export function factionNightRecord(history, factionId) {
  let favored = 0;
  let struck = 0;
  for (const row of history || []) {
    if ((row.favored || []).includes(factionId)) favored += 1;
    if ((row.struck || []).includes(factionId)) struck += 1;
  }
  return { favored, struck };
}

/** One hue per faction when they share a chart. */
export const FACTION_COLORS = {
  ghosts: '#a78bfa',
  zombies: '#4ade80',
  knights: '#eab308',
  watchers: '#38bdf8',
};

export function isNightshadesFaction(slug) {
  return NIGHTSHADES_FACTIONS.includes(slug);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avgPositive(vals) {
  const xs = vals.map(num).filter((n) => n > 0);
  if (!xs.length) return 0;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

/** Sum holder counts across factions for the All rollup. */
export function rollupNightshadesOwnership(factions = {}) {
  const list = NIGHTSHADES_FACTIONS.map((k) => factions[k]?.ownership || {});
  const nftHolders = list.reduce((s, o) => s + num(o.nftHolders), 0);
  const tokenHolders = list.reduce(
    (s, o) => s + num(o.tokenHolders || o.stonkHolders || o.erc20Holders),
    0,
  );
  const ammVaultNfts = list.reduce((s, o) => s + num(o.ammVaultNfts), 0);
  const burntNfts = list.reduce((s, o) => s + num(o.burntNfts), 0);
  const currentMaxSupply = list.reduce((s, o) => s + (num(o.currentMaxSupply) || 3000), 0) || 12000;
  const circulatingNftSupply = Math.max(0, currentMaxSupply - ammVaultNfts);
  const ownershipRatio = circulatingNftSupply > 0
    ? Math.min(100, (nftHolders / circulatingNftSupply) * 100)
    : 0;

  return {
    ammVaultNfts,
    burntNfts,
    currentMaxSupply,
    circulatingNftSupply,
    nftHolders,
    stonkHolders: tokenHolders,
    tokenHolders,
    erc20Holders: tokenHolders,
    ownershipRatio: +ownershipRatio.toFixed(2),
  };
}

/** Average live prices / floors so the All Anvil charts still have a market. */
export function rollupNightshadesMarket(factions = {}, ethPriceUsd) {
  const list = NIGHTSHADES_FACTIONS.map((k) => factions[k]?.market || {});
  const tokenPriceUsd = avgPositive(list.map((m) => m.tokenPriceUsd));
  const nftFloorEth = avgPositive(list.map((m) => m.nftFloorEth));
  const eth = ethPriceUsd || avgPositive(list.map((m) => m.ethPriceUsd));
  return {
    ethPriceUsd: eth || 0,
    tokenPriceUsd,
    nftFloorEth: nftFloorEth ? +nftFloorEth.toFixed(3) : 0,
  };
}

export function seriesToDateMap(labels, data) {
  const map = {};
  (labels || []).forEach((lab, i) => {
    map[dateKey(lab)] = data?.[i];
  });
  return map;
}

/**
 * Overlay four faction series on one date axis — compare, do not sum.
 * Same shape as the ecosystem overlay: missing days stay blank unless `fill`.
 */
export function overlayFactionMaps(maps, { timeframe = 'all', fill = false } = {}) {
  const labelSet = new Set();
  for (const map of Object.values(maps || {})) {
    Object.keys(map || {}).forEach((d) => labelSet.add(dateKey(d)));
  }
  const raw = [...labelSet].filter(Boolean).sort();
  const sliced = raw.slice(-windowLen(timeframe, raw.length));
  const datasets = NIGHTSHADES_FACTION_META.map((meta) => {
    const color = FACTION_COLORS[meta.id];
    const map = maps?.[meta.id] || {};
    let started = false;
    let last = null;
    const dataPts = sliced.map((d) => {
      const n = Number(map[d]);
      const val = Number.isFinite(n) ? n : null;
      if (!fill) return val;
      if (!started) {
        if (val == null || val === 0) return null;
        started = true;
        last = val;
        return val;
      }
      if (val == null) return last;
      last = val;
      return val;
    });
    return {
      label: meta.label,
      data: dataPts,
      borderColor: color,
      backgroundColor: `${color}12`,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      spanGaps: true,
      fill: false,
    };
  }).filter((ds) => seriesHasInk(ds.data));
  return { labels: formatLabels(sliced), datasets };
}

/** Daily protocol-kept USD for one faction market. */
export function factionDailyRevenue(slice) {
  const chart = protocolRevenueChart(slice);
  if (!chart.labels?.length) return { labels: [], data: [] };
  const fees = protocolFeeCols(chart.cols).filter((c) => c.key === 'amm' || c.key === 'dex');
  const data = chart.labels.map((_, i) =>
    fees.reduce((s, c) => s + (Number(c.data?.[i]) || 0), 0),
  );
  return { labels: chart.rawLabels || chart.labels, data };
}
