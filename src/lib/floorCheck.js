import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import { internIdsForBroker } from './interns';
import { predictTbaAddress } from './anvilScan';
import {
  buildPriceIndex,
  listKnownAssets,
  resolveTbaAddress,
  tbaRegistry,
} from './tba';

// OpenSea answers the browser with access-control-allow-origin: null, so a
// sweep cannot read it directly. gg-index fetches the cheapest listings and
// the collection floors at the moment of the scan. Wallet balances are a
// separate chain read in the same sweep.
const INDEX = (import.meta.env?.VITE_GG_INDEX_URL || 'https://index.ggservices.dev').replace(/\/+$/, '');

export const FLOOR_MIN = 5;
export const FLOOR_MAX = 100;
export const STONK_COLLECTION = 'stonkbrokers-434284142';

// Activation contracts are not on the hourly StonkBrokers config. These are
// the live ones the Anvil scan already reads.
const STONK_ACTIVATION = '0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664';
const INTERN_ACTIVATION = '0x668ea9e44e0ceb5b203067873e0b9bcdf2214b37';
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';

const CHAIN = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function ownerOf(uint256) view returns (address)',
  'function isDormant(uint256) view returns (bool)',
  'function activationOf(uint256) view returns (uint256 active, uint256 tier)',
  'function getEthBalance(address) view returns (uint256)',
]);

const INTERN_LABEL = {
  activated: 'Activated',
  available: 'Available',
  dormant: 'Dormant',
  unminted: 'Not minted',
};

export function internStateLabel(state) {
  return INTERN_LABEL[state] || 'Dormant';
}

/**
 * Where a broker's two interns sit.
 *
 * Dormant: still in the parent wallet, and the broker itself is off, so the
 * intern cannot be turned on yet. Available: still in the wallet, and the
 * broker is activated, so it can be turned on. Activated: it has left that
 * dormant seat.
 */
export function internAvailability({ minted, inWallet, dormant, parentActive, activated }) {
  if (!minted && !activated) return 'unminted';
  const sitting = dormant == null ? !!inWallet : !!dormant;
  if (!sitting || (activated && !sitting)) return 'activated';
  return parentActive ? 'available' : 'dormant';
}

/** StonkBroker collection floor: 666,666 tokens × spot × 1.10. Not the OpenSea dust ask. */
export function stonkBrokerFloor(data) {
  const cfg = data?.projects?.stonk?.config || {};
  const market = data?.projects?.stonk?.market || {};
  const unit = Number(cfg.unitValue) || 0;
  const token = Number(market.tokenPriceUsd) || 0;
  const eth = Number(market.ethPriceUsd) || 0;
  const fromUnit = unit > 1 && token > 0 ? unit * token * 1.1 : 0;
  const fromBook = (Number(market.nftFloorEth) || 0) * eth;
  const usd = fromUnit > 0 ? fromUnit : fromBook;
  const rounded = Math.round(usd * 1e6) / 1e6;
  return {
    usd: rounded,
    eth: eth > 0 && rounded > 0 ? rounded / eth : Number(market.nftFloorEth) || 0,
  };
}

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

export function feePartsFromPayload(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    label: String(row?.label || 'Fee'),
    bps: Number(row?.bps) || 0,
  })).filter((row) => row.bps > 0);
}

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

/** USD floor per NFT contract. A live OpenSea floor replaces the hourly one. */
export function liveFloorIndex(data, floors) {
  const map = nftFloorIndex(data);
  for (const row of floors || []) {
    const ca = String(row?.address || '').toLowerCase();
    const usd = Number(row?.usd);
    if (ca && usd > 0) map[ca] = usd;
  }
  return map;
}

/** Dev server proxies this. Production goes through gg-index instead. */
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

/**
 * Asks and NFT floors for one sweep.
 *
 * `live` is true when OpenSea was read just now. If that read fails and the
 * hourly ledger still has listings, those are returned with `live: false` so
 * the page can say the book is the last snapshot rather than a fresh ask.
 */
export async function loadFloorBook(data, limit) {
  const count = parseFloorCount(limit);
  try {
    const res = await fetch(`${INDEX}/v1/opensea/floor?limit=${count}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`OpenSea floor read failed (${res.status}).`);
    const body = await res.json();
    const listings = (Array.isArray(body?.listings) ? body.listings : [])
      .map((row) => ({
        id: Number(row?.id),
        ask: Number(row?.ask) || 0,
        symbol: String(row?.symbol || ''),
        usd: Number(row?.usd) || 0,
      }))
      .filter((row) => row.id > 0 && row.ask > 0)
      .slice(0, count);
    if (!listings.length) throw new Error(body?.error || 'OpenSea returned no listings.');
    return {
      listings,
      floors: liveFloorIndex(data, body.floors),
      feeParts: feePartsFromPayload(body?.feeParts),
      fetchedAt: body?.fetchedAt || '',
      live: true,
    };
  } catch (err) {
    const baked = bakedListings(data, count);
    if (!baked.length) throw err;
    return {
      listings: baked,
      floors: liveFloorIndex(data, []),
      feeParts: [],
      fetchedAt: data?.lastUpdated || '',
      live: false,
    };
  }
}

function decodeAddress(data) {
  if (!data || data === '0x' || String(data).length < 66) return null;
  try {
    return ethers.getAddress(`0x${String(data).slice(-40)}`);
  } catch {
    return null;
  }
}

function decodeUint(data) {
  if (!data || data === '0x') return 0n;
  try {
    return BigInt(data);
  } catch {
    return 0n;
  }
}

function decodeWord(data) {
  const body = String(data || '').replace(/^0x/, '');
  const slice = body.slice(0, 64);
  if (!slice) return 0n;
  try {
    return BigInt(`0x${slice}`);
  } catch {
    return 0n;
  }
}

async function readChain(provider, calls) {
  const mc = new ethers.Contract(MULTICALL, [
    'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])',
  ], provider);
  const size = 700;
  const slices = [];
  for (let i = 0; i < calls.length; i += size) slices.push(calls.slice(i, i + size));
  const out = new Array(slices.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < slices.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await aggregateSlice(mc, slices[index]);
    }
  };
  const workers = Math.min(4, slices.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out.flat();
}

async function aggregateSlice(mc, slice) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mc.tryAggregate.staticCall(false, slice);
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  if (slice.length > 120) {
    const mid = Math.ceil(slice.length / 2);
    const [left, right] = await Promise.all([
      aggregateSlice(mc, slice.slice(0, mid)),
      aggregateSlice(mc, slice.slice(mid)),
    ]);
    return [...left, ...right];
  }
  throw last || new Error('Wallet read failed.');
}

/**
 * Cheapest asks, each token-bound wallet priced, and the listing minus that wallet.
 *
 * ETH, protocol tokens, NFTs, and interns publish first. Stocks and memes are
 * the long tail, so they fill in after the board is already ranked. Pictures
 * load on their own. Balances stay on one multicall: separate balanceOf calls
 * were coming back empty.
 */
export async function scanFloorListings(listings, data, floors, { onPartial } = {}) {
  const nftCa = data?.projects?.stonk?.config?.nftCa;
  if (!nftCa || !ethers.isAddress(nftCa)) throw new Error('StonkBrokers collection is not loaded.');
  if (!listings?.length) throw new Error('No OpenSea listings to check.');

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const cfg = data.projects.stonk.config || {};
  const internCfg = data?.projects?.interns?.config || {};
  const internCa = String(internCfg.nftCa || '').toLowerCase();
  const stonkActivation = cfg.activationCa || STONK_ACTIVATION;
  const internActivation = internCfg.activationCa || INTERN_ACTIVATION;
  const predicted = listings.map((row) => predictTbaAddress(nftCa, row.id));
  const registry = tbaRegistry(provider, { tbaRegistry: cfg.tbaRegistry });
  const checked = await resolveTbaAddress(registry, nftCa, listings[0].id, {
    tbaImplementation: cfg.tbaImplementation,
    tbaChainId: cfg.tbaChainId,
    tbaSalt: cfg.tbaSalt,
  });
  const tbas = String(checked).toLowerCase() === predicted[0].toLowerCase()
    ? predicted
    : await Promise.all(listings.map((row) => resolveTbaAddress(registry, nftCa, row.id, {
      tbaImplementation: cfg.tbaImplementation,
      tbaChainId: cfg.tbaChainId,
      tbaSalt: cfg.tbaSalt,
    })));

  const { erc20, erc721 } = listKnownAssets(data);
  const tailCas = new Set([...(data?.stocks || []), ...(data?.memes || [])].map((tok) => String(tok.ca || '').toLowerCase()));
  const coreIdx = [];
  const tailIdx = [];
  erc20.forEach((tok, t) => (tailCas.has(tok.ca) ? tailIdx : coreIdx).push(t));
  const book = floors || liveFloorIndex(data, []);
  const priceIndex = buildPriceIndex(data);
  const calls = [];
  const push = (target, callData, meta) => {
    calls.push({ target, callData, meta });
  };

  coreIdx.forEach((t) => {
    push(erc20[t].ca, CHAIN.encodeFunctionData('decimals', []), { kind: 'decimals', i: t });
  });
  listings.forEach((row, i) => {
    const tba = tbas[i];
    push(MULTICALL, CHAIN.encodeFunctionData('getEthBalance', [tba]), { kind: 'eth', i });
    coreIdx.forEach((t) => {
      push(erc20[t].ca, CHAIN.encodeFunctionData('balanceOf', [tba]), { kind: 'erc20', i, t });
    });
    erc721.forEach((tok, t) => {
      if (tok.ca === internCa) return;
      push(tok.ca, CHAIN.encodeFunctionData('balanceOf', [tba]), { kind: 'erc721', i, t });
    });
    push(stonkActivation, CHAIN.encodeFunctionData('activationOf', [row.id]), { kind: 'brokerActive', i });
    for (const spec of internIdsForBroker(row.id)) {
      if (!internCa) continue;
      push(internCa, CHAIN.encodeFunctionData('ownerOf', [spec.id]), { kind: 'internOwner', i, id: spec.id });
      push(internCa, CHAIN.encodeFunctionData('isDormant', [spec.id]), { kind: 'internDormant', i, id: spec.id });
      push(internActivation, CHAIN.encodeFunctionData('activationOf', [spec.id]), { kind: 'internActive', i, id: spec.id });
    }
  });

  const decimals = erc20.map(() => 18);
  const eth = listings.map(() => null);
  const erc20Bal = listings.map(() => erc20.map(() => null));
  const erc721Bal = listings.map(() => erc721.map(() => null));
  const brokerActive = listings.map(() => false);
  const internBits = listings.map(() => ({}));

  const applyReturns = (packed, returned) => {
    returned.forEach((item, n) => {
      const meta = packed[n].meta;
      const ok = item.success && item.returnData && item.returnData !== '0x';
      if (meta.kind === 'decimals' && ok) {
        const nDec = Number(decodeUint(item.returnData));
        if (nDec > 0 && nDec <= 36) decimals[meta.i] = nDec;
        return;
      }
      if (meta.kind === 'eth') {
        eth[meta.i] = ok ? decodeUint(item.returnData) : null;
        return;
      }
      if (meta.kind === 'erc20') {
        erc20Bal[meta.i][meta.t] = ok ? decodeUint(item.returnData) : null;
        return;
      }
      if (meta.kind === 'erc721') {
        erc721Bal[meta.i][meta.t] = ok ? decodeUint(item.returnData) : null;
        return;
      }
      if (meta.kind === 'brokerActive') {
        brokerActive[meta.i] = ok && decodeWord(item.returnData) > 0n;
        return;
      }
      const slot = internBits[meta.i][meta.id] || {};
      if (meta.kind === 'internOwner') slot.owner = ok ? decodeAddress(item.returnData) : null;
      if (meta.kind === 'internDormant') slot.dormant = ok ? decodeWord(item.returnData) > 0n : null;
      if (meta.kind === 'internActive') slot.activated = ok && decodeWord(item.returnData) > 0n;
      internBits[meta.i][meta.id] = slot;
    });
  };

  applyReturns(calls, await readChain(provider, calls));
  if (eth.some((bal) => bal == null)) throw new Error('Wallet read failed.');

  const assemble = (partial) => listings.map((row, i) => {
    const tba = tbas[i];
    const held = [];
    const ethAmount = Number(ethers.formatEther(eth[i]));
    if (ethAmount > 0) {
      held.push({
        contract: 'native',
        symbol: 'ETH',
        name: 'Ether',
        amount: ethAmount,
        nft: false,
        usdHint: (Number(data?.projects?.stonk?.market?.ethPriceUsd) || 0) * ethAmount,
      });
    }
    erc20.forEach((tok, t) => {
      const raw = erc20Bal[i][t];
      if (!(raw > 0n)) return;
      held.push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount: Number(ethers.formatUnits(raw, decimals[t])),
        nft: false,
      });
    });
    erc721.forEach((tok, t) => {
      if (tok.ca === internCa) return;
      const raw = erc721Bal[i][t];
      if (!(raw > 0n)) return;
      held.push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount: Number(raw),
        nft: true,
      });
    });

    const wallet = priceHoldings(held, priceIndex, book)
      .sort((a, b) => (b.usd - a.usd) || String(a.symbol).localeCompare(String(b.symbol)));

    const interns = internIdsForBroker(row.id).map((spec) => {
      const bit = internBits[i][spec.id] || {};
      const minted = !!bit.owner && bit.owner !== ethers.ZeroAddress;
      const inWallet = minted && bit.owner.toLowerCase() === String(tba).toLowerCase();
      const state = internAvailability({
        minted,
        inWallet,
        dormant: bit.dormant,
        parentActive: brokerActive[i],
        activated: bit.activated,
      });
      const each = book[internCa] || 0;
      return {
        ...spec,
        state,
        inWallet,
        imageUrl: '',
        usd: inWallet && each > 0 ? each : 0,
      };
    });

    const heldUsd = walletUsd(wallet) + walletUsd(interns);
    return {
      ...row,
      nftCa,
      tba,
      imageUrl: '',
      floorAsk: row.ask,
      floorSymbol: row.symbol,
      floorUsd: row.usd,
      brokerActive: brokerActive[i],
      wallet,
      interns,
      walletUsd: heldUsd,
      purchaseUsd: purchaseCost(row.usd, heldUsd),
      unpricedNfts: wallet.some((tok) => tok.nft && !tok.atFloor && tok.amount > 0),
      partial,
    };
  });

  if (tailIdx.length && onPartial) onPartial(assemble(true));

  if (tailIdx.length) {
    const tailCalls = [];
    tailIdx.forEach((t) => {
      tailCalls.push({
        target: erc20[t].ca,
        callData: CHAIN.encodeFunctionData('decimals', []),
        meta: { kind: 'decimals', i: t },
      });
    });
    listings.forEach((row, i) => {
      tailIdx.forEach((t) => {
        tailCalls.push({
          target: erc20[t].ca,
          callData: CHAIN.encodeFunctionData('balanceOf', [tbas[i]]),
          meta: { kind: 'erc20', i, t },
        });
      });
    });
    applyReturns(tailCalls, await readChain(provider, tailCalls));
  }

  return assemble(false);
}
