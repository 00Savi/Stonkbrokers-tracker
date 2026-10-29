/**
 * OpenSea floor vs token-implied NFT value — the Entry / arb board.
 *
 * When token price rises, implied (unit × spot) rises. If the OpenSea floor
 * lags, buying the NFT to access that token value is incentivized. Edge is
 * not guaranteed profit: fees, TBA contents, and exit liquidity still apply.
 */

import { dateKey } from './dates';
import { bucketKey, windowLen } from './yieldHistory';

/** StonkBrokers prices the collection off 666,666 × spot × 1.10. */
function impliedMult(project, key) {
  const ticker = String(project?.config?.ticker || '').toUpperCase();
  if (key === 'stonk' || ticker === 'STONK') return 1.1;
  return 1;
}

/** Token-implied NFT USD from unitValue × spot (Stonk × 1.10). */
export function impliedNftUsd(project, key = null) {
  const unit = Number(project?.config?.unitValue) || 0;
  const token = Number(project?.market?.tokenPriceUsd) || 0;
  if (!(unit > 0) || !(token > 0)) return 0;
  return unit * token * impliedMult(project, key);
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

/**
 * (implied − floor) / implied as a percent.
 * Positive = floor cheap vs token value (buy-NFT incentive).
 */
export function entryEdgePct(floorUsd, impliedUsd) {
  const implied = Number(impliedUsd);
  const floor = Number(floorUsd);
  if (!(implied > 0) || !Number.isFinite(floor)) return null;
  return ((implied - floor) / implied) * 100;
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
 * Daily floor / implied / token / edge series from snapshots.
 * Returns raw ISO dates + parallel arrays (null where unknown).
 */
export function entryHistoryRaw(project, key = null) {
  const unit = Number(project?.config?.unitValue) || 0;
  const mult = impliedMult(project, key);
  const ethFallback = Number(project?.market?.ethPriceUsd) || 0;
  const snaps = project?.dailySnapshots || [];
  const dates = [];
  const floor = [];
  const implied = [];
  const token = [];
  const edge = [];
  for (const snap of snaps) {
    const d = dateKey(snap?.date);
    if (!d) continue;
    const px = Number(snap?.tokenPriceUsd);
    const fl = snapFloorUsd(snap, ethFallback);
    const imp = unit > 0 && Number.isFinite(px) && px > 0 ? unit * px * mult : null;
    dates.push(d);
    floor.push(fl != null && fl > 0 ? fl : null);
    implied.push(imp);
    token.push(Number.isFinite(px) && px > 0 ? px : null);
    edge.push(entryEdgePct(fl, imp));
  }
  return { dates, floor, implied, token, edge };
}

/** Windowed + optionally resampled entry history for charts. */
export function entryHistorySeries(project, {
  key = null,
  timeframe = '30d',
  interval = 'daily',
} = {}) {
  const raw = entryHistoryRaw(project, key);
  const n = windowLen(timeframe, raw.dates.length);
  const dates = raw.dates.slice(-n);
  const floor = raw.floor.slice(-n);
  const implied = raw.implied.slice(-n);
  const token = raw.token.slice(-n);
  const edge = raw.edge.slice(-n);

  if (!interval || interval === 'daily') {
    return { dates, floor, implied, token, edge };
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
      token: token[i],
      edge: edge[i],
    });
  }
  return {
    dates: order,
    floor: order.map((b) => buckets.get(b).floor),
    implied: order.map((b) => buckets.get(b).implied),
    token: order.map((b) => buckets.get(b).token),
    edge: order.map((b) => buckets.get(b).edge),
  };
}
