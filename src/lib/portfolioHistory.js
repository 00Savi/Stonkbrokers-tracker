import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import { dateKey, utcIso, utcIsoFromTs } from './dates';
import { loadHolderPosition } from './ggindex';
import { seatCashByDate } from './yieldSample';

/** Interns (and similar companions) activate in the parent token. */
export function priceSource(pData, data) {
  const parent = pData?.config?.parentKey;
  if (parent && data?.projects?.[parent]) return data.projects[parent];
  return pData;
}

function snapTs(snap) {
  const t = Number(snap?.timestamp);
  if (t > 1e12) return t / 1000;
  if (t > 0) return t;
  const k = dateKey(snap?.date);
  const ms = Date.parse(`${k}T12:00:00Z`);
  return Number.isFinite(ms) ? ms / 1000 : 0;
}

function nearestSnap(snaps, ts, ok) {
  const rows = (snaps || []).filter((s) => !ok || ok(s));
  if (!rows.length) return null;
  const target = Number(ts) || 0;
  if (!target) return rows[rows.length - 1];
  const day = utcIsoFromTs(target);
  const exact = rows.find((s) => dateKey(s.date) === day);
  if (exact) return exact;
  let best = rows[0];
  let bestDist = Infinity;
  for (const s of rows) {
    const st = snapTs(s);
    const dist = st > 0 ? Math.abs(st - target) : Infinity;
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

/**
 * Token USD at a unix second. Prefers priceHistory on clock-in days, then
 * the nearest snapshot, then the live DexScreener print.
 */
export function tokenPriceAtTs(pData, ts, { allowLive = true } = {}) {
  const day = utcIsoFromTs(ts);
  const hist = pData?.ownership?.priceHistory;
  if (day && hist?.labels && hist?.data) {
    const i = hist.labels.findIndex((d) => dateKey(d) === day);
    if (i >= 0) {
      const n = Number(hist.data[i]);
      if (n > 0 && n !== 0.03) return n;
    }
  }
  const snap = nearestSnap(
    pData?.dailySnapshots,
    ts,
    (s) => Number(s.tokenPriceUsd) > 0 && Number(s.tokenPriceUsd) !== 0.03,
  );
  const fromSnap = Number(snap?.tokenPriceUsd) || 0;
  if (fromSnap > 0) return fromSnap;
  if (allowLive === false) return 0;
  return Number(pData?.market?.tokenPriceUsd) || 0;
}

/** ETH/USD at a unix second, from floor prints when both sides exist. */
export function ethUsdAtTs(pData, ts, fallback = 0) {
  const snap = nearestSnap(
    pData?.dailySnapshots,
    ts,
    (s) => Number(s.nftFloorEth) > 0 && Number(s.nftFloorUsd) > 0,
  );
  const eth = Number(snap?.nftFloorEth) || 0;
  const usd = Number(snap?.nftFloorUsd) || 0;
  if (eth > 0 && usd > 0) return usd / eth;
  return Number(pData?.market?.ethPriceUsd) || fallback;
}

/**
 * ~USD spent on activation tokens. `tokenAmount` wins (ink, etc.);
 * otherwise the tier's reqTokens. Price is the parent token when set.
 */
export function activationTokenCostUsd(pData, { tierId, ts, tokenAmount, data } = {}) {
  const amount = Number(tokenAmount) > 0
    ? Number(tokenAmount)
    : Number((pData?.tiers || []).find((t) => t.tier === tierId || t.id === tierId)?.reqTokens) || 0;
  if (!(amount > 0)) return { usd: 0, tokens: 0, tokenPriceUsd: 0 };
  const px = tokenPriceAtTs(priceSource(pData, data), ts);
  return { usd: amount * px, tokens: amount, tokenPriceUsd: px };
}

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const ZERO = '0x0000000000000000000000000000000000000000';

export function dayKeyFromSeconds(ts) {
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return utcIsoFromTs(ts);
}

export function formatDate(ts) {
  const n = Number(ts) || 0;
  if (!n) return '—';
  return new Date(n * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Last inbound transfer to this wallet, then the first activation after that.
 * Drops before that window belong to a previous owner.
 *
 * If the NFT is still active from an activation that happened before the
 * transfer (projects that do not void on sale), count only from the transfer.
 */
export function earningStartTs({ lastTransferTs, activationTs, isActive }) {
  const transfer = Number(lastTransferTs) || 0;
  const act = Number(activationTs) || 0;
  if (act > transfer && act > 0) return act;
  if (isActive && transfer > 0) return transfer;
  if (isActive && act > 0) return act;
  return 0;
}

/** True when `date` is on or after the open day. Both ISO and M/D labels compare as UTC days. An unreadable label is left out. */
function onOrAfterOpen(date, startLabel) {
  if (!startLabel) return true;
  const day = dateKey(date);
  const start = dateKey(startLabel);
  if (!day || !start) return false;
  return day >= start;
}

function snapshotSeconds(snaps) {
  const out = {};
  for (const snap of snaps || []) {
    const t = Number(snap?.timestamp);
    const sec = t > 1e12 ? t / 1000 : t;
    const k = dateKey(snap?.date);
    if (k && sec > 0) out[k] = sec;
  }
  return out;
}

/** Per-tier map of calendar date -> USD credited to one NFT that day. */
/** Floor in USD on or before `ts`. Later snapshots do not rewrite the entry price. */
export function floorUsdOn(project, ts) {
  const day = dayKeyFromSeconds(ts);
  if (!day) return 0;
  let bestKey = '';
  let best = 0;
  for (const snap of project?.dailySnapshots || []) {
    const key = dateKey(snap?.date);
    if (!key || key > day) continue;
    const n = Number(snap.nftFloorUsd);
    if (!(n > 0) || key < bestKey) continue;
    bestKey = key;
    best = n;
  }
  return best;
}

export function dailyDropMaps(pData) {
  const byTier = {};
  for (const tier of pData?.tiers || []) {
    const map = {};
    for (const [day, value] of seatCashByDate(pData, tier)) map[day] = value;
    byTier[tier.tier] = map;
  }
  return byTier;
}

export function parseMachineMeta(json) {
  const attrs = json?.metadata?.attributes || [];
  const get = (name) => attrs.find((a) => a.trait_type === name)?.value;
  const status = String(get('Status') || '');
  const inked = /inked|awake/i.test(status);
  const weight = Number(get('Weight')) || (inked ? 100 : 0);
  const ink = Number(get('Ink Burned')) || 0;
  const multiplier = Number(get('Multiplier')) || (weight > 0 ? weight / 100 : 0);
  return {
    inked,
    weight,
    ink,
    multiplier,
    status,
    imageUrl: normalizeNftImageUrl(json?.metadata?.image || '') || null,
  };
}

/** Dashboard live count until the Mine/ink controller is indexed (7458 earning). */
export const PRINTER_EARNING_FLEET = 7458;

export function machineFleetSize(pData) {
  const n = Number(pData?.activation?.activeCount);
  return n > 0 ? n : PRINTER_EARNING_FLEET;
}

export function machineAnnualForWeight(pData, weight) {
  const fleet = machineFleetSize(pData);
  const pot =
    Number(pData?.cashflow?.holdersAnnualized) ||
    Number(pData?.cashflow?.revenueAnnualized) ||
    0;
  const w = Number(weight) || 0;
  if (!(fleet > 0) || !(pot > 0) || !(w > 0)) return 0;
  return (pot / fleet) * (w / 100);
}

export function earnedUsdForAlwaysOnNft(pData, startTs) {
  const start = Number(startTs) || 0;
  const startLabel = start ? dayKeyFromSeconds(start) : null;
  const supply =
    Number(pData?.activation?.totalSupply) ||
    Number(pData?.ownership?.currentMaxSupply) ||
    Number(pData?.config?.maxSupply) ||
    0;
  const dates = pData?.cashflow?.dailyDates || [];
  const revs = pData?.cashflow?.dailyRevenue || [];
  if (dates.length && revs.length && supply > 0) {
    let sum = 0;
    dates.forEach((date, i) => {
      if (onOrAfterOpen(date, startLabel)) {
        sum += (Number(revs[i]) || 0) / supply;
      }
    });
    return sum;
  }
  const annual = Number(pData?.tiers?.[0]?.trackedAnnualYieldUsd) || 0;
  if (!start || !(annual > 0)) return 0;
  const days = Math.max(0, (Date.now() / 1000 - start) / 86400);
  return (annual / 365) * days;
}

export function earnedUsdForTokenPosition(pData, amount, startTs) {
  if (!(amount > 0)) return 0;
  const start = Number(startTs) || 0;
  const circ = Number(pData?.ownership?.circulatingSupply) || 0;
  if (!(circ > 0)) return 0;
  const share = amount / circ;
  const dates = pData?.cashflow?.dailyDates || pData?.tiers?.[0]?.dailyDates || [];
  const revs = pData?.cashflow?.dailyRevenue || pData?.cashflow?.dailyFees || [];
  if (dates.length && revs.length) {
    const startLabel = start ? dayKeyFromSeconds(start) : null;
    let sum = 0;
    dates.forEach((date, i) => {
      if (onOrAfterOpen(date, startLabel)) {
        sum += (Number(revs[i]) || 0) * share;
      }
    });
    return sum;
  }
  const annual = (Number(pData?.cashflow?.holdersAnnualized) || 0) * share;
  const days = Math.max(0, (Date.now() / 1000 - start) / 86400);
  return (annual / 365) * days;
}

export async function fetchTokenHoldStartTs(tokenCa, wallet) {
  const indexed = await loadHolderPosition(tokenCa, wallet);
  if (indexed?.kind === 'token' && indexed.complete && (indexed.positions || []).length <= 1) {
    const opened = Number(indexed.positions?.[0]?.opened_at) || 0;
    if (opened > 0) return opened;
  }

  let page = 1;
  let bal = 0;
  let holdStart = 0;
  const w = wallet.toLowerCase();
  while (page < 20) {
    const url = `${EXPLORER}/api?module=account&action=tokentx&contractaddress=${tokenCa}&address=${wallet}&page=${page}&offset=1000&sort=asc`;
    const res = await fetch(url);
    const json = await res.json();
    const rows = json.status === '1' && Array.isArray(json.result) ? json.result : [];
    if (!rows.length) break;
    for (const tx of rows) {
      const ts = Number(tx.timeStamp) || 0;
      const decimals = Number(tx.tokenDecimal) || 18;
      let qty = 0;
      try {
        qty = Number(ethers.formatUnits(tx.value || '0', decimals));
      } catch {
        qty = 0;
      }
      const to = (tx.to || '').toLowerCase();
      const from = (tx.from || '').toLowerCase();
      if (to === w) {
        if (bal <= 0) holdStart = ts;
        bal += qty;
      }
      if (from === w) {
        bal -= qty;
        if (bal <= 0) {
          bal = 0;
          holdStart = 0;
        }
      }
    }
    if (rows.length < 1000) break;
    page += 1;
  }
  return holdStart;
}

/** Current NFT holds for one wallet, from the open-date fold. Null when it is not ready. */
export async function fetchIndexedNftHolds(nftCa, wallet) {
  const body = await loadHolderPosition(nftCa, wallet);
  if (!body || body.kind !== 'nft' || !body.complete) return null;
  const holds = body.holds || [];
  const walletLower = wallet.toLowerCase();
  if (holds.some((h) => (h.owner || '').toLowerCase() !== walletLower)) return null;
  const ownedIds = new Set();
  const inbound = new Map();
  for (const hold of body.holds || []) {
    const id = Number(hold.token_id);
    if (!Number.isFinite(id)) continue;
    ownedIds.add(id);
    inbound.set(id, {
      ts: Number(hold.received_at) || 0,
      hash: '',
      from: '',
      valueWei: '0',
    });
  }
  return { ownedIds, inbound };
}

function includeDropDate(date, startTs, startLabel, snapTs) {
  const ts = snapTs?.[dateKey(date)];
  if (ts > 0) return ts >= startTs;
  return onOrAfterOpen(date, startLabel);
}

function addDays(map, date, amount) {
  const k = dateKey(date);
  if (!k || !(amount > 0)) return;
  map[k] = (map[k] || 0) + amount;
}

function daysFromTs(startTs, through = utcIso()) {
  const start = utcIsoFromTs(startTs);
  if (!start) return [];
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${dateKey(through)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const out = [];
  for (let t = from; t <= to; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** `stonk:token` and `nightshades:ghosts` both resolve to the book that holds their history. */
export function portfolioBook(data, projectKey) {
  const key = String(projectKey || '').replace(/:token$/, '');
  if (key.startsWith('nightshades:')) {
    return data?.projects?.nightshades?.factions?.[key.split(':')[1]] || null;
  }
  return data?.projects?.[key] || null;
}

/** Wallet daily USD drops after each NFT / token position started earning. */
export function walletDailyDrops(ownedAssets, data) {
  const byDate = {};
  for (const asset of ownedAssets || []) {
    const pData = portfolioBook(data, asset.projectKey);
    if (!pData) continue;

    if (asset.tokenPosition) {
      const start = Number(asset.holdStartTs) || 0;
      const startLabel = start ? dayKeyFromSeconds(start) : null;
      const circ = Number(pData.ownership?.circulatingSupply) || 0;
      const share = circ > 0 ? (Number(asset.balance) || 0) / circ : 0;
      const dates = pData.cashflow?.dailyDates || [];
      const revs = pData.cashflow?.dailyRevenue || pData.cashflow?.dailyFees || [];
      if (share > 0 && dates.length) {
        dates.forEach((date, i) => {
          if (onOrAfterOpen(date, startLabel)) {
            addDays(byDate, date, (Number(revs[i]) || 0) * share);
          }
        });
      }
      continue;
    }

    const maps = dailyDropMaps(pData);
    const snapTs = snapshotSeconds(pData.dailySnapshots);

    for (const nft of asset.nfts || []) {
      const start = Number(nft.activationTs || nft.lastTransferTs) > 0
        ? earningStartTs(nft)
        : 0;
      if (!start) continue;
      const startLabel = dayKeyFromSeconds(start);
      const map = maps[nft.tierId] || {};
      const keys = Object.keys(map);
      if (keys.length) {
        for (const [date, amount] of Object.entries(map)) {
          if (includeDropDate(date, start, startLabel, snapTs)) {
            addDays(byDate, date, Number(amount) || 0);
          }
        }
        continue;
      }
      const daily = (Number(nft.yieldValue) || 0) / 365;
      if (!(daily > 0)) continue;
      for (const day of daysFromTs(start)) addDays(byDate, day, daily);
    }
  }

  const labels = Object.keys(byDate).sort();
  return { labels, data: labels.map((d) => byDate[d]) };
}

/**
 * ETH the wallet paid to receive the seat.
 * A known mint or a priced buy of $0 stays $0.
 * An unknown transfer is null. The floor that day is not a purchase price.
 */
export function nftAcquireCostUsd(nft) {
  if (nft?.basisKnown) return Number(nft.basisUsd) || 0;
  if (nft?.minted) return 0;
  return null;
}

/** USD paid for one seat when a transaction's payment is split across the NFTs it moved. */
export function paymentPerNft({ eth = 0, weth = 0, stableUsd = 0, nftCount = 1, ethUsd = 0 } = {}) {
  const count = Number(nftCount) > 0 ? Number(nftCount) : 1;
  const ethPaid = (Number(eth) || 0) + (Number(weth) || 0);
  const usd = ethPaid * (Number(ethUsd) || 0) + (Number(stableUsd) || 0);
  if (!(usd > 0)) return null;
  return usd / count;
}

/** What this seat cost to open: ETH paid when we know it, otherwise that day's floor, plus activation tokens. */
export function nftEntryCostUsd(nft) {
  return nftAcquireCostUsd(nft) + (Number(nft?.activationCostUsd) || 0);
}

/** Months to earn the entry cost back at the current annual yield. */
export function paybackMonths(entryCost, annualYield) {
  const cost = Number(entryCost) || 0;
  const annual = Number(annualYield) || 0;
  if (!(cost > 0) || !(annual > 0)) return null;
  return (cost / annual) * 12;
}

export function formatPaybackMonths(months) {
  if (months == null || !Number.isFinite(Number(months))) return '—';
  const n = Number(months);
  if (n >= 24) return `${Math.round(n)} mo`;
  return `${n.toFixed(1)} mo`;
}

function snapsByDay(project) {
  return [...(project?.dailySnapshots || [])]
    .map((snap) => ({
      date: dateKey(snap?.date),
      floor: Number(snap?.nftFloorUsd) || 0,
      px: Number(snap?.tokenPriceUsd) || 0,
    }))
    .filter((snap) => snap.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function carried(snaps, day, field) {
  let best = 0;
  for (const snap of snaps) {
    if (snap.date > day) break;
    if (snap[field] > 0) best = snap[field];
  }
  return best;
}

/**
 * From the first seat that opened: cash collected, and how far replacement
 * cost (floor plus that tier's tokens) has moved from what the seat cost to open.
 */
export function portfolioCashMarkSeries(ownedAssets, data) {
  const drops = walletDailyDrops(ownedAssets, data);
  const cashByDay = new Map();
  drops.labels.forEach((day, i) => {
    const key = dateKey(day) || day;
    if (key) cashByDay.set(key, (cashByDay.get(key) || 0) + (Number(drops.data[i]) || 0));
  });

  const seats = [];
  for (const asset of ownedAssets || []) {
    if (asset?.tokenPosition) continue;
    const project = portfolioBook(data, asset.projectKey);
    if (!project) continue;
    const snaps = snapsByDay(project);
    for (const nft of asset.nfts || []) {
      const start = Number(nft.activationTs || nft.lastTransferTs) > 0 ? earningStartTs(nft) : 0;
      const open = start ? dayKeyFromSeconds(start) : '';
      if (!open) continue;
      const tier = (project.tiers || []).find((row) => row.tier === nft.tierId) || project.tiers?.[0];
      seats.push({
        open,
        snaps,
        req: Number(tier?.reqTokens) || 0,
        entry: nftEntryCostUsd(nft),
      });
    }
  }

  const days = new Set(cashByDay.keys());
  for (const seat of seats) {
    days.add(seat.open);
    for (const snap of seat.snaps) {
      if (snap.date >= seat.open) days.add(snap.date);
    }
  }
  const labels = [...days].filter(Boolean).sort();
  if (labels.length < 2) return { labels: [], cash: [], mark: [] };

  let cum = 0;
  const cash = [];
  const mark = [];
  for (const day of labels) {
    cum += cashByDay.get(day) || 0;
    cash.push(cum);
    let moved = 0;
    for (const seat of seats) {
      if (seat.open > day) continue;
      const replacement = carried(seat.snaps, day, 'floor') + seat.req * carried(seat.snaps, day, 'px');
      if (!(replacement > 0)) continue;
      moved += replacement - seat.entry;
    }
    mark.push(moved);
  }
  return { labels, cash, mark };
}

/**
 * Mark value of the book each day: seat floors plus token closes, from the
 * day each position was received. Cash already paid out is not added back.
 */
export function portfolioValueSeries(ownedAssets, data) {
  const seats = [];
  const tokens = [];
  for (const asset of ownedAssets || []) {
    const project = portfolioBook(data, asset.projectKey);
    const snaps = project ? snapsByDay(project) : [];
    if (asset?.tokenPosition) {
      const start = Number(asset.holdStartTs) || 0;
      tokens.push({
        open: start ? dayKeyFromSeconds(start) : '',
        amount: Number(asset.balance) || 0,
        snaps,
        spot: Number(asset.floorValue) || 0,
      });
      continue;
    }
    for (const nft of asset.nfts || []) {
      const ts = Number(nft.lastTransferTs || nft.activationTs) || 0;
      const open = ts ? dayKeyFromSeconds(ts) : '';
      if (!open) continue;
      seats.push({ open, snaps, floorNow: Number(nft.floorValue) || 0 });
    }
  }

  const days = new Set();
  for (const row of [...seats, ...tokens]) {
    if (row.open) days.add(row.open);
    for (const snap of row.snaps || []) {
      if (!row.open || snap.date >= row.open) days.add(snap.date);
    }
  }
  const today = utcIso();
  if (today) days.add(today);
  const labels = [...days].filter(Boolean).sort();
  if (labels.length < 2) return { labels: [], total: [], seats: [], tokens: [] };

  const last = labels[labels.length - 1];
  const seatLine = [];
  const tokenLine = [];
  const total = [];
  for (const day of labels) {
    let seatUsd = 0;
    for (const seat of seats) {
      if (seat.open > day) continue;
      const floor = carried(seat.snaps, day, 'floor');
      seatUsd += floor > 0 ? floor : (day === last ? seat.floorNow : 0);
    }
    let tokenUsd = 0;
    for (const bag of tokens) {
      if (bag.open && bag.open > day) continue;
      if (!bag.open && day !== last) continue;
      const px = carried(bag.snaps, day, 'px');
      tokenUsd += px > 0 ? bag.amount * px : (day === last ? bag.spot : 0);
    }
    seatLine.push(seatUsd);
    tokenLine.push(tokenUsd);
    total.push(seatUsd + tokenUsd);
  }
  if (labels[labels.length - 1] === today) {
    const liveSeats = seats.reduce((sum, seat) => sum + seat.floorNow, 0);
    const liveTokens = tokens.reduce((sum, bag) => sum + bag.spot, 0);
    seatLine[seatLine.length - 1] = liveSeats;
    tokenLine[tokenLine.length - 1] = liveTokens;
    total[total.length - 1] = liveSeats + liveTokens;
  }
  return { labels, total, seats: seatLine, tokens: tokenLine };
}

export function bucketDropSeries(labels, values, grain = 'd') {
  if (grain === 'd') {
    return { labels: labels || [], data: (values || []).map((v) => Number(v) || 0) };
  }
  const map = new Map();
  (labels || []).forEach((d, i) => {
    const iso = dateKey(d) || d;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return;
    let key = iso;
    if (grain === 'w') {
      const day = dt.getUTCDay() || 7;
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() - (day - 1));
      key = monday.toISOString().slice(0, 10);
    } else if (grain === 'm') {
      key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    } else if (grain === 'a') {
      key = String(dt.getUTCFullYear());
    }
    map.set(key, (map.get(key) || 0) + (Number(values?.[i]) || 0));
  });
  return { labels: [...map.keys()], data: [...map.values()] };
}

export function earnedUsdForNft(pData, tierId, startTs) {
  const start = Number(startTs) || 0;
  if (!start) return 0;
  const startLabel = dayKeyFromSeconds(start);
  const map = dailyDropMaps(pData)[tierId] || {};
  const snapTs = snapshotSeconds(pData?.dailySnapshots);
  let sum = 0;
  for (const [date, amount] of Object.entries(map)) {
    if (includeDropDate(date, start, startLabel, snapTs)) sum += Number(amount) || 0;
  }
  return sum;
}

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const TOKEN_URI = new ethers.Interface(['function tokenURI(uint256) view returns (string)']);

/** Point IPFS URLs at a public gateway so <img> and canvas can load them. */
export function normalizeNftImageUrl(src) {
  if (!src) return '';
  const s = String(src).trim();
  if (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('/')) return s;
  const path = ipfsPath(s);
  if (path) return `${IPFS_GATEWAY}${path}`;
  return s;
}

function ipfsPath(src) {
  if (src.startsWith('ipfs://')) return src.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '');
  const hosted = src.match(/\/ipfs\/(.+)$/);
  return hosted ? hosted[1] : '';
}

/**
 * The picture in `tokenURI`. Brokers, interns, and mancers keep an SVG in the
 * data URI. Other collections point at a JSON file whose `image` field is the art.
 * The explorer's `image_url` is the collection icon, so every row looked like a briefcase.
 */
export function nftArtFromUri(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (/^data:application\/json/i.test(raw)) {
    const meta = decodeDataJson(raw);
    return normalizeNftImageUrl(meta?.image || meta?.image_url || '');
  }
  return '';
}

export async function imageFromTokenUri(uri) {
  const inline = nftArtFromUri(uri);
  if (inline) return inline;
  const raw = String(uri || '').trim();
  const url = normalizeNftImageUrl(raw);
  if (!/^https?:\/\//i.test(url)) return '';
  const res = await fetch(url);
  if (!res.ok) return '';
  const type = res.headers.get('content-type') || '';
  if (type.startsWith('image/')) return url;
  const meta = await res.json();
  return normalizeNftImageUrl(meta?.image || meta?.image_url || '');
}

function decodeDataJson(uri) {
  const comma = uri.indexOf(',');
  const head = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  const text = /;base64/i.test(head)
    ? new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)))
    : decodeURIComponent(payload);
  return JSON.parse(text);
}

async function readTokenUri(nftCa, tokenId) {
  const data = TOKEN_URI.encodeFunctionData('tokenURI', [tokenId]);
  const res = await fetch(ROBINHOOD_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: nftCa, data }, 'latest'],
    }),
  });
  if (!res.ok) return '';
  const body = await res.json();
  if (!body?.result || body.error) return '';
  try {
    return TOKEN_URI.decodeFunctionResult('tokenURI', body.result)[0] || '';
  } catch {
    return '';
  }
}

export async function fetchNftImage(nftCa, tokenId) {
  try {
    const image = await imageFromTokenUri(await readTokenUri(nftCa, tokenId));
    if (image) return image;
  } catch {
    // A missing token reverts. Leave the frame empty rather than the collection icon.
  }
  const json = await fetchNftInstance(nftCa, tokenId);
  return normalizeNftImageUrl(json?.metadata?.image || '') || '';
}

export async function fetchNftInstance(nftCa, tokenId) {
  try {
    const res = await fetch(`${EXPLORER}/api/v2/tokens/${nftCa}/instances/${tokenId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchMachineMeta(nftCa, tokenId) {
  const [json, imageUrl] = await Promise.all([
    fetchNftInstance(nftCa, tokenId),
    fetchNftImage(nftCa, tokenId).catch(() => ''),
  ]);
  const parsed = json
    ? parseMachineMeta(json)
    : { inked: false, weight: 0, ink: 0, multiplier: 0, status: '', imageUrl: null };
  if (imageUrl) parsed.imageUrl = imageUrl;
  return parsed;
}

function transferTokenCa(t) {
  return String(t?.token?.address_hash || t?.token?.address || t?.token?.hash || '').toLowerCase();
}

function isNftTransfer(t) {
  const type = String(t?.token?.type || t?.token_type || '').toUpperCase();
  if (type.includes('721') || type.includes('1155')) return true;
  return t?.total?.token_id != null || t?.token_id != null;
}

const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const ACTIVATED_TOPIC = ethers.id('Activated(uint256,address,uint8,uint256)');
const LOG_CHUNK = 8_000_000;
const ACTIVATED_IFACE = new ethers.Interface([
  'event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)',
]);
const TRANSFER_IFACE = new ethers.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

/** nft address -> activation contract. data.json does not carry these. */
const ACTIVATION_BY_NFT = {
  '0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0': '0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664',
  '0x797a2e030b7e49107c8f07bf0300ea9cae88ca57': '0x47c2194caacfc778c0baa41e10008bb7d720cd59',
  '0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97': '0xef5f726990442bc3207d72d1f9dcf8677cf02358',
  '0x890215157dbec26d67605324271b34ba05ee9e58': '0xb3f6f0fad13b0b60873ac2a90281ebe431fdb6ed',
  '0x1215d567dc4e0f2999dcc262d78d1586ff97154f': '0xf658b4abdafc6c8d652742d563e9d9ab8b454475',
  '0xfc4b0c4f464dc3037cf013934648a8a726d565a5': '0x668ea9e44e0ceb5b203067873e0b9bcdf2214b37',
  '0x7cd6e36286f92f55cc8f498e36e10a975a332aac': '0xf8de142e9f6c4b5f276416b4bcad01758acdcace',
  '0xcc87ff3b3c08fc04c1f60f54989eb7dfab3e0b31': '0x8fef7779c917ca4db5bd4b2691aaab4122531361',
  '0x63a405ef2d9937675925ac8a99ce1694bcfd2922': '0xe6253d5548844b943ad4ff99680d429fd73d600c',
  '0x291cbcd1e9f44724ed5acbdc6e1ddd72b28f7911': '0x9507068897b4f60adb12ca9032e0cf03dfac13d4',
};

function tierIdFromChain(val) {
  const n = Number(val);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return `T${n}`;
  return null;
}

const ethMinuteCache = new Map();

/** Coinbase ETH-USD close of the minute the sale landed in. */
export async function ethUsdAtMinute(ts) {
  const minute = Math.floor(Number(ts) / 60) * 60;
  if (!minute) return 0;
  if (ethMinuteCache.has(minute)) return ethMinuteCache.get(minute);
  const start = new Date(minute * 1000).toISOString();
  const end = new Date((minute + 60) * 1000).toISOString();
  try {
    const res = await fetch(`https://api.exchange.coinbase.com/products/ETH-USD/candles?start=${start}&end=${end}&granularity=60`);
    const rows = await res.json();
    const row = Array.isArray(rows) ? (rows.find((r) => r[0] === minute) || rows[0]) : null;
    const px = row ? Number(row[4]) : 0;
    if (px > 0) ethMinuteCache.set(minute, px);
    return px > 0 ? px : 0;
  } catch {
    return 0;
  }
}

async function getLogsChunked(provider, filter, fromBlock, toBlock, { stop } = {}) {
  const out = [];
  let end = toBlock;
  while (end >= fromBlock) {
    const start = Math.max(fromBlock, end - LOG_CHUNK + 1);
    let logs = [];
    try {
      logs = await provider.getLogs({ ...filter, fromBlock: start, toBlock: end });
    } catch {
      if (end - start > 250_000) {
        const mid = Math.floor((start + end) / 2);
        logs = [
          ...(await getLogsChunked(provider, filter, mid + 1, end)),
          ...(await getLogsChunked(provider, filter, start, mid)),
        ];
      }
    }
    out.push(...logs);
    if (stop?.(out)) break;
    if (start === fromBlock) break;
    end = start - 1;
  }
  return out;
}

async function blockTime(provider, blockNumber, cache) {
  const n = Number(blockNumber);
  if (cache.has(n)) return cache.get(n);
  const block = await provider.getBlock(n);
  const ts = Number(block?.timestamp) || 0;
  cache.set(n, ts);
  return ts;
}

/** Latest inbound transfer of each token id to this wallet. Stops once every id is found. */
export async function fetchLatestInbounds(provider, nftCa, wallet, tokenIds) {
  const wanted = new Set((tokenIds || []).map(Number).filter(Number.isFinite));
  const found = new Map();
  if (!wanted.size) return found;
  const tip = await provider.getBlockNumber();
  const toTopic = ethers.zeroPadValue(wallet, 32);
  const times = new Map();
  let end = tip;
  while (wanted.size && end >= 0) {
    const start = Math.max(0, end - LOG_CHUNK + 1);
    let logs = [];
    try {
      logs = await provider.getLogs({
        address: nftCa,
        topics: [TRANSFER_TOPIC, null, toTopic],
        fromBlock: start,
        toBlock: end,
      });
    } catch {
      logs = [];
    }
    logs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
    for (const log of logs) {
      let parsed;
      try { parsed = TRANSFER_IFACE.parseLog(log); } catch { continue; }
      const id = Number(parsed.args.tokenId);
      if (!wanted.has(id) || found.has(id)) continue;
      const ts = await blockTime(provider, log.blockNumber, times);
      const from = String(parsed.args.from);
      found.set(id, {
        hash: log.transactionHash,
        ts,
        from,
        mint: from.toLowerCase() === ZERO,
        block: Number(log.blockNumber),
      });
      wanted.delete(id);
    }
    if (!wanted.size || start === 0) break;
    end = start - 1;
  }
  return found;
}

/** Native ETH, WETH, and USDG the buyer sent, split across the NFTs that moved. */
export async function readSalePayment(provider, hash) {
  if (!hash) return null;
  const tx = await provider.getTransaction(hash);
  const rec = await provider.getTransactionReceipt(hash);
  if (!tx || !rec) return null;
  const buyer = String(tx.from).toLowerCase();
  let nftCount = 0;
  let weth = 0n;
  let stable = 0n;
  for (const log of rec.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.topics.length === 4) {
      nftCount += 1;
      continue;
    }
    if (log.topics.length !== 3) continue;
    const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
    if (from !== buyer) continue;
    const addr = log.address.toLowerCase();
    let amt = 0n;
    try { amt = BigInt(log.data); } catch { amt = 0n; }
    if (addr === WETH) weth += amt;
    if (addr === USDG) stable += amt;
  }
  return {
    eth: Number(ethers.formatEther(tx.value)),
    weth: Number(ethers.formatEther(weth)),
    stableUsd: Number(ethers.formatUnits(stable, 6)),
    nftCount,
  };
}

function activationCaFor(nft, pData) {
  const fromBook = String(pData?.config?.activationCa || '').toLowerCase();
  if (/^0x[a-f0-9]{40}$/.test(fromBook)) return fromBook;
  return ACTIVATION_BY_NFT[String(nft?.nftCa || '').toLowerCase()] || '';
}

async function ownerActivations(provider, activationCa, wallet, fromBlock) {
  const tip = await provider.getBlockNumber();
  const ownerTopic = ethers.zeroPadValue(wallet, 32);
  const logs = await getLogsChunked(provider, {
    address: activationCa,
    topics: [ACTIVATED_TOPIC, null, ownerTopic],
  }, Math.max(0, fromBlock), tip);
  const times = new Map();
  const rows = [];
  for (const log of logs) {
    let parsed;
    try { parsed = ACTIVATED_IFACE.parseLog(log); } catch { continue; }
    const ts = await blockTime(provider, log.blockNumber, times);
    rows.push({
      tokenId: Number(parsed.args.tokenId),
      tierId: tierIdFromChain(parsed.args.tier),
      tokens: Number(ethers.formatUnits(parsed.args.feePaid, 18)) || 0,
      ts,
      block: Number(log.blockNumber),
    });
  }
  return rows;
}

/**
 * Replace the indexer's open time and the floor-as-cost guess with the
 * transfer that actually delivered each seat, and the activation fee this
 * wallet paid after that.
 */
export async function attachSaleCosts(provider, nfts, data) {
  const list = (nfts || []).filter((n) => n?.nftCa && n?.wallet && n.tokenId != null);
  const groups = new Map();
  for (const nft of list) {
    const key = `${String(nft.nftCa).toLowerCase()}:${String(nft.wallet).toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(nft);
  }
  const payments = new Map();
  await mapLimited([...groups.values()], 2, async (group) => {
    const inbound = await fetchLatestInbounds(provider, group[0].nftCa, group[0].wallet, group.map((n) => n.tokenId));
    for (const nft of group) {
      const row = inbound.get(Number(nft.tokenId));
      if (!row) continue;
      nft.lastTransferHash = row.hash;
      nft.lastTransferTs = row.ts;
      nft.minted = row.mint;
      nft.inboundBlock = row.block;
      if (row.mint) {
        nft.basisUsd = 0;
        nft.basisKnown = true;
        nft.purchaseEth = 0;
      }
    }
  });
  const hashes = [...new Set(list.map((n) => n.lastTransferHash).filter(Boolean))];
  await mapLimited(hashes, 4, async (hash) => {
    try {
      payments.set(hash, await readSalePayment(provider, hash));
    } catch {
      payments.set(hash, null);
    }
  });
  const minutes = new Set();
  for (const nft of list) {
    const pay = payments.get(nft.lastTransferHash);
    if (nft.lastTransferTs && pay && ((pay.eth || 0) + (pay.weth || 0)) > 0) {
      minutes.add(Math.floor(nft.lastTransferTs / 60) * 60);
    }
  }
  await mapLimited([...minutes], 4, (minute) => ethUsdAtMinute(minute));

  for (const nft of list) {
    if (nft.minted && nft.basisKnown) continue;
    const pay = payments.get(nft.lastTransferHash);
    if (!pay) continue;
    const ethUsd = await ethUsdAtMinute(nft.lastTransferTs);
    const usd = paymentPerNft({ ...pay, ethUsd });
    if (usd == null) continue;
    nft.purchaseEth = ((pay.eth || 0) + (pay.weth || 0)) / (pay.nftCount > 0 ? pay.nftCount : 1);
    nft.basisUsd = usd;
    nft.basisKnown = true;
  }

  const actGroups = new Map();
  for (const nft of list) {
    if (!(nft.inboundBlock > 0) || nft.machineWeight) continue;
    const pData = portfolioBook(data, nft.projectKey);
    const ca = activationCaFor(nft, pData);
    if (!ca) continue;
    const key = `${ca}:${String(nft.wallet).toLowerCase()}`;
    if (!actGroups.has(key)) actGroups.set(key, { ca, wallet: nft.wallet, fromBlock: nft.inboundBlock, nfts: [] });
    const group = actGroups.get(key);
    group.fromBlock = Math.min(group.fromBlock, nft.inboundBlock);
    group.nfts.push(nft);
  }
  await mapLimited([...actGroups.values()], 2, async (group) => {
    let events = null;
    try {
      events = await ownerActivations(provider, group.ca, group.wallet, group.fromBlock);
    } catch {
      events = null;
    }
    if (!events) return;
    for (const nft of group.nfts) {
      const mine = events
        .filter((ev) => ev.tokenId === Number(nft.tokenId) && ev.ts + 120 >= Number(nft.lastTransferTs))
        .sort((a, b) => a.ts - b.ts);
      if (!mine.length) {
        nft.activationCostUsd = 0;
        nft.actTokens = 0;
        continue;
      }
      const pData = portfolioBook(data, nft.projectKey);
      const priceBook = priceSource(pData, data);
      let usd = 0;
      let tokens = 0;
      for (const ev of mine) {
        const px = tokenPriceAtTs(priceBook, ev.ts, { allowLive: false });
        tokens += ev.tokens;
        if (px > 0) usd += ev.tokens * px;
      }
      const last = mine[mine.length - 1];
      nft.activationTs = last.ts;
      nft.actTokens = tokens;
      nft.activationCostUsd = usd;
      nft.actTokenPriceUsd = tokens > 0 ? usd / tokens : 0;
      if (last.tierId) {
        const tier = (pData?.tiers || []).find((t) => t.tier === last.tierId || t.id === last.tierId);
        nft.tierId = last.tierId;
        if (tier?.name) nft.tierName = tier.name;
        if (nft.isActive && tier && Number(tier.trackedAnnualYieldUsd) > 0) {
          nft.yieldValue = Number(tier.trackedAnnualYieldUsd) || 0;
        }
      }
      const start = earningStartTs(nft);
      if (nft.isActive && start) nft.earnedValue = earnedUsdForNft(pData, nft.tierId, start);
    }
  });

  for (const nft of list) {
    if (nft.machineWeight) continue;
    const pData = portfolioBook(data, nft.projectKey);
    const start = earningStartTs(nft);
    if (!nft.isActive || !start || !pData) continue;
    if (nft.earnedValue == null) nft.earnedValue = earnedUsdForNft(pData, nft.tierId, start);
    else if (nft.lastTransferTs) nft.earnedValue = earnedUsdForNft(pData, nft.tierId, start);
  }
}

/** ETH sent in a tx, split across NFT transfers of this collection when the explorer lists them. */
export async function fetchTxNftCost(hash, nftCa) {
  if (!hash) return { eth: 0, nftCount: 0, perNftEth: 0 };
  try {
    const res = await fetch(`${EXPLORER}/api/v2/transactions/${hash}`);
    if (!res.ok) return { eth: 0, nftCount: 0, perNftEth: 0 };
    const json = await res.json();
    const wei = json.value != null ? BigInt(json.value) : 0n;
    const eth = Number(ethers.formatEther(wei));
    const transfers = json.token_transfers || [];
    const ca = String(nftCa || '').toLowerCase();
    const nftXfers = transfers.filter((t) => {
      if (!isNftTransfer(t)) return false;
      if (!ca) return true;
      const addr = transferTokenCa(t);
      return !addr || addr === ca;
    });
    const nftCount = nftXfers.length;
    return { eth, nftCount, perNftEth: nftCount > 0 ? eth / nftCount : eth };
  } catch {
    return { eth: 0, nftCount: 0, perNftEth: 0 };
  }
}

export async function fetchTxEthValue(hash) {
  const { eth } = await fetchTxNftCost(hash);
  return eth;
}

export async function mapLimited(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    out.push(...(await Promise.all(slice.map(fn))));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function explorerJson(url, attempts = 5) {
  let last = 'explorer';
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(400 * 2 ** i);
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => null);
      if (!json) {
        last = `HTTP ${res.status}`;
        continue;
      }
      if (json.status === '1' && Array.isArray(json.result)) return json.result;
      if (json.status === '1') return [];
      last = typeof json.result === 'string' ? json.result : json.message || `HTTP ${res.status}`;
    } catch (e) {
      last = e.message;
    }
  }
  throw new Error(last);
}

export async function fetchNftTransferLog(nftCa, wallet) {
  const ownedIds = new Set();
  const inbound = new Map();
  let page = 1;
  while (page < 40) {
    const url = `${EXPLORER}/api?module=account&action=tokennfttx&contractaddress=${nftCa}&address=${wallet}&page=${page}&offset=100&sort=asc`;
    const rows = await explorerJson(url);
    if (!rows.length) break;
    const w = wallet.toLowerCase();
    for (const tx of rows) {
      const id = Number(tx.tokenID);
      if (!Number.isFinite(id)) continue;
      const to = (tx.to || '').toLowerCase();
      const from = (tx.from || '').toLowerCase();
      if (to === w) {
        ownedIds.add(id);
        inbound.set(id, {
          ts: Number(tx.timeStamp) || 0,
          hash: tx.hash,
          from,
          valueWei: tx.value || '0',
          mint: from === ZERO,
        });
      }
      if (from === w) ownedIds.delete(id);
    }
    if (rows.length < 100) break;
    page += 1;
  }
  return { ownedIds, inbound };
}

export async function fetchOwnedNftIdsV2(nftCa, wallet) {
  const ids = new Set();
  const params = new URLSearchParams({ holder_address_hash: wallet });
  let next = `${EXPLORER}/api/v2/tokens/${nftCa}/instances?${params}`;
  for (let page = 0; page < 40 && next; page++) {
    let res;
    for (let i = 0; i < 4; i++) {
      if (i) await sleep(400 * 2 ** i);
      res = await fetch(next);
      if (res.ok) break;
      if (res.status !== 429 && res.status < 500) return ids;
    }
    if (!res?.ok) break;
    const json = await res.json();
    for (const item of json.items || []) {
      const id = Number(item.id);
      if (Number.isFinite(id)) ids.add(id);
    }
    const n = json.next_page_params;
    if (!n || typeof n !== 'object') break;
    const q = new URLSearchParams({ holder_address_hash: wallet, ...n });
    next = `${EXPLORER}/api/v2/tokens/${nftCa}/instances?${q}`;
  }
  return ids;
}

export async function enumerateOwnedIds(nftContract, wallet, bal) {
  const ids = new Set();
  await mapLimited([...Array(bal).keys()], 3, async (i) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const tId = await nftContract.tokenOfOwnerByIndex(wallet, i);
        ids.add(Number(tId));
        return;
      } catch {
        await sleep(250 * (attempt + 1));
      }
    }
  });
  return ids;
}
