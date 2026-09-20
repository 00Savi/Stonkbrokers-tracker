import { ethers } from 'ethers';
import { dateKey, utcIso, utcIsoFromTs } from './dates';

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
export function tokenPriceAtTs(pData, ts) {
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

function parseMd(label) {
  const m = String(label || '').match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return { m: Number(m[1]), d: Number(m[2]) };
}

function sameOrAfterDateLabel(a, startLabel) {
  const pa = parseMd(a);
  const pb = parseMd(startLabel);
  if (!pa || !pb) return true;
  if (pa.m === pb.m) return pa.d >= pb.d;
  if (pb.m === 12 && pa.m === 1) return true;
  if (pa.m === 12 && pb.m === 1) return false;
  return pa.m > pb.m;
}

/** Per-tier map of calendar date -> USD credited to one NFT that day. */
export function dailyDropMaps(pData) {
  const byTier = {};
  for (const t of pData?.tiers || []) {
    const map = {};
    const dates = t.dailyDates || [];
    const yields = t.dailyYields || [];
    dates.forEach((d, i) => {
      map[d] = Number(yields[i]) || 0;
    });
    for (const snap of pData.dailySnapshots || []) {
      if (!snap?.date || map[snap.date] != null) continue;
      const row = snap.tiers?.find((x) => x.tier === t.tier);
      const annual = Number(row?.yieldUsd);
      if (annual > 0) map[snap.date] = annual / 365;
    }
    byTier[t.tier] = map;
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
    imageUrl: normalizeNftImageUrl(json?.image_url || json?.metadata?.image || '') || null,
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
      if (!startLabel || sameOrAfterDateLabel(date, startLabel)) {
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
      if (!startLabel || sameOrAfterDateLabel(date, startLabel)) {
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

function includeDropDate(date, startTs, startLabel, snapTs) {
  const ts = snapTs?.[date];
  if (ts > 0) return ts >= startTs;
  return !startLabel || sameOrAfterDateLabel(date, startLabel);
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

/** Wallet daily USD drops after each NFT / token position started earning. */
export function walletDailyDrops(ownedAssets, data) {
  const byDate = {};
  for (const asset of ownedAssets || []) {
    const pData = data?.projects?.[asset.projectKey];
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
          if (!startLabel || sameOrAfterDateLabel(date, startLabel)) {
            addDays(byDate, date, (Number(revs[i]) || 0) * share);
          }
        });
      }
      continue;
    }

    const maps = dailyDropMaps(pData);
    const snapTs = {};
    for (const snap of pData.dailySnapshots || []) {
      const t = Number(snap.timestamp);
      snapTs[snap.date] = t > 1e12 ? t / 1000 : t;
    }

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
  const snapTs = {};
  for (const snap of pData?.dailySnapshots || []) {
    const t = Number(snap.timestamp);
    snapTs[snap.date] = t > 1e12 ? t / 1000 : t;
  }
  let sum = 0;
  for (const [date, amount] of Object.entries(map)) {
    const ts = snapTs[date];
    if (ts > 0) {
      if (ts >= start) sum += Number(amount) || 0;
    } else if (!startLabel || sameOrAfterDateLabel(date, startLabel)) {
      sum += Number(amount) || 0;
    }
  }
  return sum;
}

/** Point IPFS URLs at a public gateway so <img> and canvas can load them. */
export function normalizeNftImageUrl(src) {
  if (!src) return '';
  const s = String(src).trim();
  if (s.startsWith('ipfs://')) {
    return `https://dweb.link/ipfs/${s.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '')}`;
  }
  return s;
}

export async function fetchNftImage(nftCa, tokenId) {
  const json = await fetchNftInstance(nftCa, tokenId);
  return normalizeNftImageUrl(json?.image_url || json?.animation_url || json?.metadata?.image || null);
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
  const json = await fetchNftInstance(nftCa, tokenId);
  if (!json) return { inked: false, weight: 0, ink: 0, multiplier: 0, status: '', imageUrl: null };
  return parseMachineMeta(json);
}

function transferTokenCa(t) {
  return String(t?.token?.address_hash || t?.token?.address || t?.token?.hash || '').toLowerCase();
}

function isNftTransfer(t) {
  const type = String(t?.token?.type || t?.token_type || '').toUpperCase();
  if (type.includes('721') || type.includes('1155')) return true;
  return t?.total?.token_id != null || t?.token_id != null;
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
