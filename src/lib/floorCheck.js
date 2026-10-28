import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import {
  buildPriceIndex,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from './tba';

export const FLOOR_MIN = 5;
export const FLOOR_MAX = 10;
export const STONK_COLLECTION = 'stonkbrokers-nft';

const LISTING_QUERY = (limit) => `query {
  collectionItems(
    collectionSlug: "${STONK_COLLECTION}",
    sort: { by: PRICE, direction: ASC },
    limit: ${limit},
    filter: { isListed: true }
  ) {
    items {
      tokenId
      bestListing { pricePerItem { usd token { unit symbol } } }
    }
  }
}`;

export function parseFloorCount(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < FLOOR_MIN || n > FLOOR_MAX) return FLOOR_MAX;
  return n;
}

/** Ask minus what the token-bound wallet is already worth. */
export function purchaseCost(askUsd, walletUsd) {
  return (Number(askUsd) || 0) - (Number(walletUsd) || 0);
}

export function walletUsd(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.usd) || 0), 0);
}

/** Collection floor in USD, keyed by NFT contract. */
export function nftFloorIndex(data) {
  const fallbackEth = Number(data?.projects?.stonk?.market?.ethPriceUsd) || 0;
  const map = {};
  const add = (ca, floorEth, ethUsd) => {
    const key = String(ca || '').toLowerCase();
    const eth = Number(floorEth) || 0;
    const px = Number(ethUsd) || fallbackEth;
    if (key && eth > 0 && px > 0) map[key] = eth * px;
  };
  for (const project of Object.values(data?.projects || {})) {
    add(project?.config?.nftCa, project?.market?.nftFloorEth, project?.market?.ethPriceUsd);
    for (const faction of Object.values(project?.factions || {})) {
      add(faction?.config?.nftCa, faction?.market?.nftFloorEth, faction?.market?.ethPriceUsd);
    }
  }
  return map;
}

export function priceHoldings(tokens, priceIndex, floors) {
  return (tokens || []).map((tok) => {
    if (tok.nft) {
      const each = floors[String(tok.contract || '').toLowerCase()] || 0;
      return { ...tok, usd: each * (Number(tok.amount) || 0), atFloor: each > 0 };
    }
    const hinted = Number(tok.usdHint);
    const key = String(tok.contract || '').toLowerCase();
    const px = priceIndex[key] || priceIndex[tok.contract] || 0;
    const usd = Number.isFinite(hinted) && hinted !== 0 ? hinted : px * (Number(tok.amount) || 0);
    return { ...tok, usd, atFloor: false };
  });
}

export function bakedListings(data, limit) {
  const rows = data?.projects?.stonk?.market?.floorListings;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      id: Number(row.id),
      ask: Number(row.ask) || 0,
      symbol: String(row.symbol || ''),
      usd: Number(row.usd) || 0,
    }))
    .filter((row) => row.id > 0 && row.ask > 0)
    .slice(0, limit);
}

function listingsFromPayload(body, limit) {
  const items = body?.data?.collectionItems?.items || [];
  return items.map((it) => {
    const token = it?.bestListing?.pricePerItem?.token || {};
    const usd = Number(it?.bestListing?.pricePerItem?.usd);
    return {
      id: Number(it.tokenId),
      ask: Number(token.unit) || 0,
      symbol: String(token.symbol || ''),
      usd: Number.isFinite(usd) ? usd : 0,
    };
  }).filter((row) => row.id > 0 && row.ask > 0).slice(0, limit);
}

/** Dev server proxies this. The public site cannot call OpenSea directly. */
export async function fetchLiveListings(limit) {
  const res = await fetch('/opensea-gql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: LISTING_QUERY(limit) }),
  });
  if (!res.ok) throw new Error(`OpenSea listings ${res.status}`);
  const body = await res.json();
  if (body.errors?.length && !body.data) throw new Error(body.errors[0].message || 'OpenSea listings failed');
  return listingsFromPayload(body, limit);
}

export async function loadFloorListings(data, limit) {
  if (import.meta.env?.DEV) {
    try {
      const live = await fetchLiveListings(limit);
      if (live.length) return live;
    } catch {
      // The ledger copy is the fallback when the dev proxy is down.
    }
  }
  return bakedListings(data, limit);
}

/**
 * Cheapest asks, each token-bound wallet priced, and ask minus that wallet.
 */
export async function scanFloorListings(listings, data) {
  const nftCa = data?.projects?.stonk?.config?.nftCa;
  if (!nftCa || !ethers.isAddress(nftCa)) throw new Error('StonkBrokers collection is not loaded.');
  if (!listings?.length) throw new Error('No OpenSea listings to check.');

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const cfg = data.projects.stonk.config || {};
  const registry = tbaRegistry(provider, { tbaRegistry: cfg.tbaRegistry });
  const tbas = await Promise.all(listings.map((row) => resolveTbaAddress(registry, nftCa, row.id, {
    tbaImplementation: cfg.tbaImplementation,
    tbaChainId: cfg.tbaChainId,
    tbaSalt: cfg.tbaSalt,
  })));

  const inventories = await fetchAllTbaInventories(tbas, data);
  const priceIndex = buildPriceIndex(data);
  const floors = nftFloorIndex(data);

  return listings.map((row, i) => {
    const tba = tbas[i];
    const wallet = priceHoldings(inventories[tba] || [], priceIndex, floors)
      .sort((a, b) => (b.usd - a.usd) || String(a.symbol).localeCompare(String(b.symbol)));
    const held = walletUsd(wallet);
    return {
      ...row,
      nftCa,
      tba,
      wallet,
      walletUsd: held,
      purchaseUsd: purchaseCost(row.usd, held),
      unpricedNfts: wallet.some((tok) => tok.nft && !tok.atFloor && tok.amount > 0),
    };
  });
}
