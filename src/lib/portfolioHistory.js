import { ethers } from 'ethers';

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const ZERO = '0x0000000000000000000000000000000000000000';

export function dayKeyFromSeconds(ts) {
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
    imageUrl: json?.image_url || json?.metadata?.image || null,
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

export async function fetchNftImage(nftCa, tokenId) {
  const json = await fetchNftInstance(nftCa, tokenId);
  return json?.image_url || json?.animation_url || json?.metadata?.image || null;
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

export async function fetchTxEthValue(hash) {
  if (!hash) return 0;
  try {
    const res = await fetch(`${EXPLORER}/api/v2/transactions/${hash}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const wei = json.value != null ? BigInt(json.value) : 0n;
    return Number(ethers.formatEther(wei));
  } catch {
    return 0;
  }
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
