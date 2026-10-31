/**
 * OpenSea listings vs Anvil token floor — the Entry / arb board.
 *
 * Anvil prices one NFT at a fixed token count (`unitValue`) plus the buy fee
 * (Stonk ~10%). That token cost is the Anvil floor. OpenSea asks are a separate
 * book. The gap is OpenSea − Anvil. As the cheapest listings sell, the next ask
 * becomes the floor and that gap usually widens.
 */

import { dateKey } from './dates';
import { bucketKey, windowLen } from './yieldHistory';

/** Default Anvil sell stack: 10% staker + 0.5% protocol. */
export const DEFAULT_SELL_FEE_BPS = 1050;

/** Default Anvil buy markup (random buy). Stonk uses 10%. */
export const DEFAULT_BUY_FEE_BPS = 1000;

/** Depth checkpoints: how the OS floor moves after N cheapest sells. */
export const DEPTH_CLEARS = [0, 3, 5, 10];

/**
 * Anvil random-buy markup. Fetcher derives floors as unit × spot × 1.10 for
 * every Anvil vault; Stonk is confirmed at ~10%. Override via config.buyFeeBps.
 */
export function buyFeeBps(project, _key = null) {
  const n = Number(project?.config?.buyFeeBps);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_BUY_FEE_BPS;
}

function buyMult(project, key) {
  return 1 + buyFeeBps(project, key) / 10000;
}

/** True when a stored floor matches the Anvil ask within 0.5% — i.e. derived, not OpenSea. */
export function isDerivedFloorUsd(floorUsd, anvilUsd, tol = 0.005) {
  const fl = Number(floorUsd);
  const anvil = Number(anvilUsd);
  if (!(fl > 0) || !(anvil > 0)) return false;
  return Math.abs(fl - anvil) / anvil < tol;
}

export function anvilUnit(project) {
  return Number(project?.config?.unitValue) || 0;
}

export function sellFeeBps(project) {
  const n = Number(project?.config?.sellFeeBps);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_SELL_FEE_BPS;
}

/** Tokens received selling one NFT into the Anvil (after fees). */
export function sellNetTokens(unit, feeBps = DEFAULT_SELL_FEE_BPS) {
  const u = Number(unit) || 0;
  const bps = Number(feeBps);
  if (!(u > 0)) return 0;
  if (!(bps >= 0)) return u;
  return u * (1 - bps / 10000);
}

/** Gross token-implied NFT USD (unit × spot). Optional buyMult for Stonk. */
export function impliedNftUsd(project, key = null) {
  const unit = anvilUnit(project);
  const token = Number(project?.market?.tokenPriceUsd) || 0;
  if (!(unit > 0) || !(token > 0)) return 0;
  return unit * token * buyMult(project, key);
}

/**
 * Anvil floor in USD: what buying one NFT from the vault costs in tokens
 * (unit × spot × buy fee). This is the token-linked floor, not OpenSea.
 */
export function anvilAskUsd(project, key = null) {
  return impliedNftUsd(project, key);
}

/** Normalize OpenSea listing rows to USD, cheapest first. */
export function normalizeListings(listings, ethUsd = 0) {
  const eth = Number(ethUsd) || 0;
  return (listings || [])
    .map((row) => {
      const id = Number(row?.id);
      const ask = Number(row?.ask) || 0;
      let usd = Number(row?.usd) || 0;
      if (!(usd > 0) && ask > 0 && eth > 0) usd = ask * eth;
      return {
        id,
        ask,
        symbol: String(row?.symbol || ''),
        usd,
      };
    })
    .filter((row) => row.id > 0 && row.usd > 0)
    .sort((a, b) => a.usd - b.usd || a.id - b.id);
}

/**
 * OpenSea vs Anvil ladder.
 * After `cleared` cheapest listings sell, the new floor is listings[cleared].
 * Gap = newFloor − anvilAsk (positive = OpenSea premium to Anvil).
 */
export function listingDepthBook(listings, anvilAsk, {
  ethUsd = 0,
  clears = DEPTH_CLEARS,
} = {}) {
  const rows = normalizeListings(listings, ethUsd);
  const anvil = Number(anvilAsk) || 0;
  const ladder = rows.map((row, i) => ({
    rank: i + 1,
    ...row,
    gapUsd: anvil > 0 ? row.usd - anvil : null,
    gapPct: anvil > 0 ? ((row.usd - anvil) / anvil) * 100 : null,
  }));

  const depth = (clears || DEPTH_CLEARS).map((cleared) => {
    const next = rows[cleared] || null;
    const gapUsd = next && anvil > 0 ? next.usd - anvil : null;
    return {
      cleared,
      label: cleared === 0 ? 'Now' : `After ${cleared}`,
      floor: next,
      floorUsd: next ? next.usd : null,
      gapUsd,
      gapPct: gapUsd != null && anvil > 0 ? (gapUsd / anvil) * 100 : null,
      anvilUsd: anvil > 0 ? anvil : null,
    };
  });

  return {
    ladder,
    depth,
    anvilUsd: anvil > 0 ? anvil : null,
    openSeaFloorUsd: rows[0]?.usd || null,
    count: rows.length,
  };
}

/** Net Anvil sell proceeds in USD. */
export function sellNetUsd(project, feeBps = null) {
  const unit = anvilUnit(project);
  const token = Number(project?.market?.tokenPriceUsd) || 0;
  if (!(unit > 0) || !(token > 0)) return 0;
  return sellNetTokens(unit, feeBps == null ? sellFeeBps(project) : feeBps) * token;
}

/** OpenSea (or star) floor in USD — NFT only, no activation tokens. */
export function floorNftUsd(project) {
  const market = project?.market || {};
  const booked = Number(market.nftFloorUsd);
  if (Number.isFinite(booked) && booked > 0) return booked;
  const eth = Number(market.ethPriceUsd) || 0;
  const floorEth = Number(market.nftFloorEth) || 0;
  if (eth > 0 && floorEth > 0) return floorEth * eth;
  return 0;
}

/** OpenSea floor expressed in collection tokens. */
export function floorInTokens(floorUsd, tokenUsd) {
  const floor = Number(floorUsd);
  const token = Number(tokenUsd);
  if (!(floor > 0) || !(token > 0)) return null;
  return floor / token;
}

/**
 * (high − low) / high as a percent.
 * Positive = low leg cheap vs high leg.
 */
export function entryEdgePct(lowUsd, highUsd) {
  const high = Number(highUsd);
  const low = Number(lowUsd);
  if (!(high > 0) || !Number.isFinite(low)) return null;
  return ((high - low) / high) * 100;
}

/**
 * Sell-side arb room: (Anvil net − OpenSea floor) / Anvil net.
 * Positive = buy floor NFT, sell into Anvil for more tokens than the fee takes.
 */
export function sellArbEdgePct(floorUsd, project, feeBps = null) {
  return entryEdgePct(floorUsd, sellNetUsd(project, feeBps));
}

function snapFloorUsd(snap, fallbackEthUsd) {
  const booked = Number(snap?.nftFloorUsd);
  if (Number.isFinite(booked) && booked > 0) return booked;
  const eth = Number(snap?.ethPriceUsd) || Number(fallbackEthUsd) || 0;
  const floorEth = Number(snap?.nftFloorEth) || 0;
  if (eth > 0 && floorEth > 0) return floorEth * eth;
  return null;
}

/**
 * Daily series: OpenSea floor USD (null when the snap only stored the Anvil
 * formula), Anvil ask (unit × spot × buy fee), sell-net, edges, token spot.
 */
export function entryHistoryRaw(project, key = null) {
  const unit = anvilUnit(project);
  const mult = buyMult(project, key);
  const fee = sellFeeBps(project);
  const netUnit = sellNetTokens(unit, fee);
  const ethFallback = Number(project?.market?.ethPriceUsd) || 0;
  const snaps = project?.dailySnapshots || [];
  const dates = [];
  const floor = [];
  const implied = [];
  const sellNet = [];
  const floorTokens = [];
  const unitLine = [];
  const sellNetTokensLine = [];
  const token = [];
  const edge = [];
  const sellEdge = [];

  for (const snap of snaps) {
    const d = dateKey(snap?.date);
    if (!d) continue;
    const px = Number(snap?.tokenPriceUsd);
    const flRaw = snapFloorUsd(snap, ethFallback);
    const imp = unit > 0 && Number.isFinite(px) && px > 0 ? unit * px * mult : null;
    const net = unit > 0 && Number.isFinite(px) && px > 0 ? netUnit * px : null;
    // Snapshots historically wrote Anvil-derived floors as nftFloorEth. Those
    // stack on the Anvil line — drop them so OpenSea only plots when it
    // actually diverges from unit × spot × buy fee.
    const snapSrc = String(snap?.floorSource || '');
    const keepFloor = flRaw != null && flRaw > 0 && (
      snapSrc === 'opensea' || snapSrc === 'listing' || !isDerivedFloorUsd(flRaw, imp)
    );
    const fl = keepFloor ? flRaw : null;
    const flTok = fl != null && Number.isFinite(px) && px > 0 ? fl / px : null;

    dates.push(d);
    floor.push(fl);
    implied.push(imp);
    sellNet.push(net);
    floorTokens.push(flTok);
    unitLine.push(unit > 0 ? unit : null);
    sellNetTokensLine.push(netUnit > 0 ? netUnit : null);
    token.push(Number.isFinite(px) && px > 0 ? px : null);
    edge.push(fl != null ? entryEdgePct(fl, imp) : null);
    sellEdge.push(fl != null ? entryEdgePct(fl, net) : null);
  }

  // Live OpenSea ask book — patch today's point so the chart shows the gap
  // even when today's daily snap still carries a derived floor.
  const liveOs = normalizeListings(project?.market?.floorListings, ethFallback)[0]?.usd || null;
  if (liveOs > 0 && dates.length) {
    const last = dates.length - 1;
    floor[last] = liveOs;
    const px = token[last];
    floorTokens[last] = px > 0 ? liveOs / px : null;
    edge[last] = entryEdgePct(liveOs, implied[last]);
    sellEdge[last] = entryEdgePct(liveOs, sellNet[last]);
  }

  return {
    dates,
    floor,
    implied,
    sellNet,
    floorTokens,
    unit: unitLine,
    sellNetTokens: sellNetTokensLine,
    token,
    edge,
    sellEdge,
    meta: { unit, feeBps: fee, netUnit, buyMult: mult },
  };
}

/** Windowed + optionally resampled entry history for charts. */
export function entryHistorySeries(project, {
  key = null,
  timeframe = '30d',
  interval = 'daily',
} = {}) {
  const raw = entryHistoryRaw(project, key);
  const n = windowLen(timeframe, raw.dates.length);
  const slice = (arr) => (arr || []).slice(-n);
  const dates = slice(raw.dates);
  const floor = slice(raw.floor);
  const implied = slice(raw.implied);
  const sellNet = slice(raw.sellNet);
  const floorTokens = slice(raw.floorTokens);
  const unit = slice(raw.unit);
  const sellNetTokens = slice(raw.sellNetTokens);
  const token = slice(raw.token);
  const edge = slice(raw.edge);
  const sellEdge = slice(raw.sellEdge);

  if (!interval || interval === 'daily') {
    return {
      dates, floor, implied, sellNet, floorTokens, unit, sellNetTokens, token, edge, sellEdge, meta: raw.meta,
    };
  }

  const order = [];
  const buckets = new Map();
  for (let i = 0; i < dates.length; i += 1) {
    const b = bucketKey(dates[i], interval);
    if (!b) continue;
    if (!buckets.has(b)) order.push(b);
    buckets.set(b, {
      floor: floor[i],
      implied: implied[i],
      sellNet: sellNet[i],
      floorTokens: floorTokens[i],
      unit: unit[i],
      sellNetTokens: sellNetTokens[i],
      token: token[i],
      edge: edge[i],
      sellEdge: sellEdge[i],
    });
  }
  return {
    dates: order,
    floor: order.map((b) => buckets.get(b).floor),
    implied: order.map((b) => buckets.get(b).implied),
    sellNet: order.map((b) => buckets.get(b).sellNet),
    floorTokens: order.map((b) => buckets.get(b).floorTokens),
    unit: order.map((b) => buckets.get(b).unit),
    sellNetTokens: order.map((b) => buckets.get(b).sellNetTokens),
    token: order.map((b) => buckets.get(b).token),
    edge: order.map((b) => buckets.get(b).edge),
    sellEdge: order.map((b) => buckets.get(b).sellEdge),
    meta: raw.meta,
  };
}
