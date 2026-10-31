/**
 * Intern Finder — OpenSea + Intern Exchange desk asks, each with TBA value,
 * parent-broker activation (tier + age), and revenue-share title when the
 * title engine answers.
 */

import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import {
  INTERNS_TITLES,
  internClass,
  internParentBroker,
} from './interns';
import {
  ANVIL_VAULTS,
  predictTbaAddress,
  quoteAnvilSnipe,
  scanAnvilVault,
  snipeCostFor,
} from './anvilScan';
import {
  buildPriceIndex,
  listKnownAssets,
  resolveTbaAddress,
  tbaRegistry,
} from './tba';

const INDEX = (import.meta.env?.VITE_GG_INDEX_URL || 'https://index.ggservices.dev').replace(/\/+$/, '');
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
const INTERN_SLUG = 'interns';
const STONK_ACTIVATION = '0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664';
const INTERN_ACTIVATION = '0x668ea9e44e0ceb5b203067873e0b9bcdf2214b37';

const CHAIN = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function getEthBalance(address) view returns (uint256)',
  'function activationOf(uint256) view returns (uint256 active, uint256 tier)',
  'function titleOf(uint256) view returns (uint8)',
  'function titles(uint256) view returns (uint8)',
  'function shareBps(uint256) view returns (uint256)',
]);

export const INTERN_FINDER_MIN = 5;
export const INTERN_FINDER_MAX = 50;

export const INTERN_FINDER_SORTS = [
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'netCost', label: 'Lowest net cost' },
  { id: 'ask', label: 'Lowest ask' },
  { id: 'tba', label: 'Highest TBA' },
  { id: 'share', label: 'Highest share %' },
  { id: 'parentDays', label: 'Longest parent active' },
  { id: 'parentTier', label: 'Highest parent tier' },
];

const TIER_BY_INDEX = ['T0', 'T1', 'T2', 'T3', 'T4'];
const TIER_WEIGHT = { T0: 1, T1: 1.25, T2: 1.6, T3: 2, T4: 3.33 };

export function parseInternFinderLimit(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < INTERN_FINDER_MIN || n > INTERN_FINDER_MAX) {
    return 25;
  }
  return n;
}

function titleFromIndex(idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= INTERNS_TITLES.length) return null;
  return INTERNS_TITLES[i];
}

function titleFromShareBps(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n / 100;
  return INTERNS_TITLES.find((t) => Math.abs(t.sharePct - pct) < 0.05) || null;
}

function snapTier(map, id) {
  if (!map) return null;
  return map[id] || map[String(id)] || null;
}

function tierLabel(tierId, tiers) {
  if (!tierId) return null;
  const row = (tiers || []).find((t) => t.id === tierId || t.tier === tierId);
  return row?.name || tierId;
}

function daysSince(ts, nowSec = Math.floor(Date.now() / 1000)) {
  const t = Number(ts) || 0;
  if (!(t > 0) || t > nowSec) return null;
  return (nowSec - t) / 86400;
}

function walletUsd(rows) {
  return (rows || []).reduce((sum, row) => sum + (Number(row.usd) || 0), 0);
}

/** Opportunity: TBA coverage, parent strength, and share — over net cost. */
export function opportunityScore(row) {
  const ask = Math.max(Number(row.askUsd) || 0, 0);
  const tba = Math.max(Number(row.tbaUsd) || 0, 0);
  const net = Number(row.netCostUsd);
  const netFloor = Number.isFinite(net) ? Math.max(net, ask * 0.02, 1) : Math.max(ask, 1);
  const share = Math.max(Number(row.sharePct) || 0, 0);
  const parentW = TIER_WEIGHT[row.parentTierId] || 1;
  const days = Math.min(Math.max(Number(row.parentDays) || 0, 0), 365) / 365;
  const coverage = tba / Math.max(ask, 1);
  return ((1 + coverage) * (1 + share / 2.5) * parentW * (1 + days)) / netFloor;
}

export function rankInternRows(rows, sort = 'opportunity') {
  const copy = [...(rows || [])];
  const cmp = {
    opportunity: (a, b) => (b.opportunity - a.opportunity) || (a.netCostUsd - b.netCostUsd),
    netCost: (a, b) => (a.netCostUsd - b.netCostUsd) || (b.opportunity - a.opportunity),
    ask: (a, b) => (a.askUsd - b.askUsd) || (b.opportunity - a.opportunity),
    tba: (a, b) => (b.tbaUsd - a.tbaUsd) || (a.netCostUsd - b.netCostUsd),
    share: (a, b) => ((b.sharePct || -1) - (a.sharePct || -1)) || (b.opportunity - a.opportunity),
    parentDays: (a, b) => ((b.parentDays || -1) - (a.parentDays || -1)) || (b.opportunity - a.opportunity),
    parentTier: (a, b) => (
      ((TIER_WEIGHT[b.parentTierId] || 0) - (TIER_WEIGHT[a.parentTierId] || 0))
      || ((b.parentDays || -1) - (a.parentDays || -1))
    ),
  }[sort] || ((a, b) => b.opportunity - a.opportunity);
  copy.sort((a, b) => cmp(a, b) || (a.id - b.id));
  return copy;
}

function normalizeListingRows(rows, limit) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: Number(row?.id),
      ask: Number(row?.ask) || 0,
      symbol: String(row?.symbol || ''),
      usd: Number(row?.usd) || 0,
    }))
    .filter((row) => row.id > 0 && (row.usd > 0 || row.ask > 0))
    .sort((a, b) => (a.usd || a.ask) - (b.usd || b.ask) || a.id - b.id)
    .slice(0, limit);
}

/** Dev Vite proxies OpenSea GraphQL; production cannot call gql.opensea.io directly. */
async function fetchInternListingsViaProxy(limit) {
  const res = await fetch('/opensea-gql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      query: `query {
        collectionItems(
          collectionSlug: "${INTERN_SLUG}",
          sort: { by: PRICE, direction: ASC },
          limit: ${limit},
          filter: { isListed: true }
        ) {
          items {
            tokenId
            bestListing { pricePerItem { usd token { unit symbol } } }
          }
        }
      }`,
    }),
  });
  if (!res.ok) throw new Error(`OpenSea proxy ${res.status}`);
  const body = await res.json();
  if (body.errors?.length && !body.data) {
    throw new Error(body.errors[0].message || 'OpenSea proxy failed');
  }
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
  });
}

/**
 * Cheapest OpenSea intern asks.
 * Prefers live gg-index, then the Vite GraphQL proxy (local), then the
 * hourly `market.floorListings` snapshot baked into data.json.
 */
export async function loadInternListings(limit = 25, { baked = [] } = {}) {
  const count = parseInternFinderLimit(limit);
  const errors = [];

  try {
    const res = await fetch(`${INDEX}/v1/opensea/listings?slug=${INTERN_SLUG}&limit=${count}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`index ${res.status}`);
    const body = await res.json();
    const listings = normalizeListingRows(body?.listings, count);
    if (listings.length) {
      return {
        listings,
        fetchedAt: body?.fetchedAt || '',
        address: body?.address || '',
        source: 'index',
      };
    }
    if (body?.error) errors.push(String(body.error));
  } catch (err) {
    errors.push(err?.message || 'index failed');
  }

  try {
    const listings = normalizeListingRows(await fetchInternListingsViaProxy(count), count);
    if (listings.length) {
      return { listings, fetchedAt: '', address: '', source: 'proxy' };
    }
  } catch (err) {
    errors.push(err?.message || 'proxy failed');
  }

  const bakedRows = normalizeListingRows(baked, count);
  if (bakedRows.length) {
    return { listings: bakedRows, fetchedAt: '', address: '', source: 'snapshot' };
  }

  throw new Error(errors[0] ? `OpenSea intern listings failed (${errors[0]}).` : 'No OpenSea intern listings.');
}

async function readChain(provider, calls) {
  const mc = new ethers.Contract(MULTICALL, [
    'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])',
  ], provider);
  const size = 700;
  const out = [];
  for (let i = 0; i < calls.length; i += size) {
    const slice = calls.slice(i, i + size);
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        out.push(...await mc.tryAggregate.staticCall(false, slice));
        last = null;
        break;
      } catch (err) {
        last = err;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    if (last) throw last;
  }
  return out;
}

function decodeUint(data) {
  if (!data || data === '0x') return 0n;
  try { return BigInt(data); } catch { return 0n; }
}

function decodeWord(data) {
  const body = String(data || '').replace(/^0x/, '');
  if (!body) return 0n;
  try { return BigInt(`0x${body.slice(0, 64)}`); } catch { return 0n; }
}

async function titleEngineHasCode(provider, ca) {
  if (!ca || !ethers.isAddress(ca)) return false;
  try {
    const code = await provider.getCode(ca);
    return !!(code && code !== '0x');
  } catch {
    return false;
  }
}

/**
 * Enrich OpenSea intern asks with TBA balances, parent broker activation,
 * intern activation, and title/share when the engine is live.
 */
export async function enrichInternListings(listings, data, { onPartial } = {}) {
  const intern = data?.projects?.interns;
  const stonk = data?.projects?.stonk;
  const nftCa = intern?.config?.nftCa;
  if (!nftCa || !ethers.isAddress(nftCa)) throw new Error('Interns collection is not loaded.');
  if (!listings?.length) throw new Error('No intern listings to check.');

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const cfg = intern.config || {};
  const stonkCfg = stonk?.config || {};
  const stonkActivation = stonkCfg.activationCa || STONK_ACTIVATION;
  const internActivation = cfg.activationCa || INTERN_ACTIVATION;
  const engineCa = cfg.internEngineCa || '';
  const engineLive = await titleEngineHasCode(provider, engineCa);

  const predicted = listings.map((row) => predictTbaAddress(nftCa, row.id));
  const registry = tbaRegistry(provider, { tbaRegistry: cfg.tbaRegistry || stonkCfg.tbaRegistry });
  const checked = await resolveTbaAddress(registry, nftCa, listings[0].id, {
    tbaImplementation: cfg.tbaImplementation || stonkCfg.tbaImplementation,
    tbaChainId: cfg.tbaChainId || stonkCfg.tbaChainId,
    tbaSalt: cfg.tbaSalt || stonkCfg.tbaSalt,
  });
  const tbas = String(checked).toLowerCase() === predicted[0].toLowerCase()
    ? predicted
    : await Promise.all(listings.map((row) => resolveTbaAddress(registry, nftCa, row.id, {
      tbaImplementation: cfg.tbaImplementation || stonkCfg.tbaImplementation,
      tbaChainId: cfg.tbaChainId || stonkCfg.tbaChainId,
      tbaSalt: cfg.tbaSalt || stonkCfg.tbaSalt,
    })));

  const { erc20, erc721 } = listKnownAssets(data);
  const priceIndex = buildPriceIndex(data);
  const ethUsd = Number(stonk?.market?.ethPriceUsd || intern?.market?.ethPriceUsd) || 0;
  const calls = [];
  const push = (target, callData, meta) => calls.push({ target, callData, meta });

  erc20.forEach((tok, t) => {
    push(tok.ca, CHAIN.encodeFunctionData('decimals', []), { kind: 'decimals', t });
  });

  listings.forEach((row, i) => {
    const tba = tbas[i];
    const parentId = internParentBroker(row.id);
    push(MULTICALL, CHAIN.encodeFunctionData('getEthBalance', [tba]), { kind: 'eth', i });
    erc20.forEach((tok, t) => {
      push(tok.ca, CHAIN.encodeFunctionData('balanceOf', [tba]), { kind: 'erc20', i, t });
    });
    erc721.forEach((tok, t) => {
      push(tok.ca, CHAIN.encodeFunctionData('balanceOf', [tba]), { kind: 'erc721', i, t });
    });
    if (parentId) {
      push(stonkActivation, CHAIN.encodeFunctionData('activationOf', [parentId]), { kind: 'parentAct', i });
    }
    push(internActivation, CHAIN.encodeFunctionData('activationOf', [row.id]), { kind: 'internAct', i });
    if (engineLive) {
      push(engineCa, CHAIN.encodeFunctionData('titleOf', [row.id]), { kind: 'title', i });
      push(engineCa, CHAIN.encodeFunctionData('shareBps', [row.id]), { kind: 'share', i });
    }
  });

  const decimals = erc20.map(() => 18);
  const eth = listings.map(() => null);
  const erc20Bal = listings.map(() => erc20.map(() => null));
  const erc721Bal = listings.map(() => erc721.map(() => null));
  const parentAct = listings.map(() => ({ active: false, tier: null }));
  const internAct = listings.map(() => ({ active: false, tier: null }));
  const titles = listings.map(() => null);
  const shareBps = listings.map(() => null);

  const returned = await readChain(provider, calls);
  returned.forEach((item, n) => {
    const meta = calls[n].meta;
    const ok = item.success && item.returnData && item.returnData !== '0x';
    if (meta.kind === 'decimals' && ok) {
      const nDec = Number(decodeUint(item.returnData));
      if (nDec > 0 && nDec <= 36) decimals[meta.t] = nDec;
      return;
    }
    if (meta.kind === 'eth') {
      eth[meta.i] = ok ? decodeUint(item.returnData) : 0n;
      return;
    }
    if (meta.kind === 'erc20') {
      erc20Bal[meta.i][meta.t] = ok ? decodeUint(item.returnData) : 0n;
      return;
    }
    if (meta.kind === 'erc721') {
      erc721Bal[meta.i][meta.t] = ok ? decodeUint(item.returnData) : 0n;
      return;
    }
    if ((meta.kind === 'parentAct' || meta.kind === 'internAct') && ok) {
      const raw = String(item.returnData).replace(/^0x/, '').padStart(128, '0');
      const active = BigInt(`0x${raw.slice(0, 64)}`);
      const tierN = Number(BigInt(`0x${raw.slice(64, 128)}`));
      const parsed = {
        active: active > 0n,
        tierId: active > 0n ? (TIER_BY_INDEX[tierN] || `T${tierN}`) : null,
      };
      if (meta.kind === 'parentAct') parentAct[meta.i] = parsed;
      else internAct[meta.i] = parsed;
      return;
    }
    if (meta.kind === 'title' && ok) {
      titles[meta.i] = titleFromIndex(Number(decodeWord(item.returnData)));
      return;
    }
    if (meta.kind === 'share' && ok) {
      shareBps[meta.i] = Number(decodeWord(item.returnData));
    }
  });

  if (eth.some((bal) => bal == null)) throw new Error('Intern TBA read failed.');

  const stonkTiers = stonk?.config?.tiers || [];
  const internTiers = intern?.config?.tiers || [];
  const parentSnaps = stonk?.activation?.activeTokenTiers || {};
  const internSnaps = intern?.activation?.activeTokenTiers || {};
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = listings.map((row, i) => {
    const tba = tbas[i];
    const parentId = internParentBroker(row.id);
    const held = [];
    const ethAmount = Number(ethers.formatEther(eth[i] || 0n));
    if (ethAmount > 0) {
      held.push({
        contract: 'native',
        symbol: 'ETH',
        name: 'Ether',
        amount: ethAmount,
        nft: false,
        usd: ethAmount * ethUsd,
      });
    }
    erc20.forEach((tok, t) => {
      const raw = erc20Bal[i][t];
      if (!(raw > 0n)) return;
      const amount = Number(ethers.formatUnits(raw, decimals[t]));
      const px = priceIndex[tok.ca] || 0;
      held.push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount,
        nft: false,
        usd: px * amount,
      });
    });
    erc721.forEach((tok, t) => {
      const raw = erc721Bal[i][t];
      if (!(raw > 0n)) return;
      held.push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount: Number(raw),
        nft: true,
        usd: 0,
      });
    });
    held.sort((a, b) => (b.usd - a.usd) || String(a.symbol).localeCompare(String(b.symbol)));

    const parentSnap = parentId ? snapTier(parentSnaps, parentId) : null;
    const parentLive = parentAct[i];
    const parentTierId = parentLive.tierId || parentSnap?.t || null;
    const parentActive = !!(parentLive.active || parentSnap);
    const parentTs = Number(parentSnap?.ts) || 0;
    const parentDays = parentActive ? daysSince(parentTs, nowSec) : null;

    const internSnap = snapTier(internSnaps, row.id);
    const selfLive = internAct[i];
    const selfTierId = selfLive.tierId || internSnap?.t || null;
    const selfActive = !!(selfLive.active || internSnap);

    let title = titles[i];
    if (!title && shareBps[i] != null) title = titleFromShareBps(shareBps[i]);
    const sharePct = title ? title.sharePct : (shareBps[i] != null ? shareBps[i] / 100 : null);

    const tbaUsd = walletUsd(held);
    const askUsd = Number(row.usd) || 0;
    const netCostUsd = askUsd - tbaUsd;
    const klass = internClass(row.id);
    const base = {
      id: row.id,
      klass,
      label: klass === 'sigma' ? 'V1 Sigma' : klass === 'divergent' ? 'V2 Divergent' : '',
      market: 'opensea',
      ask: Number(row.ask) || 0,
      symbol: row.symbol || 'ETH',
      askUsd,
      tba,
      nftCa,
      holdings: held,
      tbaUsd,
      netCostUsd,
      parentId,
      parentActive,
      parentTierId,
      parentTierName: tierLabel(parentTierId, stonkTiers),
      parentDays,
      parentTs,
      selfActive,
      selfTierId,
      selfTierName: tierLabel(selfTierId, internTiers),
      titleId: title?.id || null,
      titleName: title?.name || null,
      sharePct,
      titleEngineLive: engineLive,
      imageUrl: '',
    };
    base.opportunity = opportunityScore(base);
    return base;
  });

  if (onPartial) onPartial(rows);
  return { rows, titleEngineLive: engineLive };
}

function deskRowFromVault(row, data, vault, quote, engineLive) {
  const parentId = internParentBroker(row.tokenId);
  const stonk = data?.projects?.stonk;
  const intern = data?.projects?.interns;
  const parentSnap = parentId ? snapTier(stonk?.activation?.activeTokenTiers, parentId) : null;
  const internSnap = snapTier(intern?.activation?.activeTokenTiers, row.tokenId);
  const cost = snipeCostFor(data, vault, quote);
  const askUsd = cost?.usd || 0;
  const tbaUsd = Number(row.usd) || 0;
  const klass = internClass(row.tokenId);
  const parentTierId = parentSnap?.t || null;
  const parentActive = !!parentSnap;
  const parentDays = parentActive ? daysSince(parentSnap?.ts) : null;
  const base = {
    id: row.tokenId,
    klass,
    label: klass === 'sigma' ? 'V1 Sigma' : klass === 'divergent' ? 'V2 Divergent' : '',
    market: 'desk',
    ask: cost ? cost.eth : 0,
    symbol: 'ETH+',
    askUsd,
    tba: row.tba,
    nftCa: vault.nftCa,
    holdings: row.holdings || [],
    tbaUsd,
    netCostUsd: askUsd - tbaUsd,
    parentId,
    parentActive,
    parentTierId,
    parentTierName: tierLabel(parentTierId, stonk?.config?.tiers),
    parentDays,
    parentTs: Number(parentSnap?.ts) || 0,
    selfActive: !!internSnap,
    selfTierId: internSnap?.t || null,
    selfTierName: tierLabel(internSnap?.t, intern?.config?.tiers),
    titleId: null,
    titleName: null,
    sharePct: null,
    titleEngineLive: engineLive,
    imageUrl: '',
    snipe: cost,
  };
  base.opportunity = opportunityScore(base);
  return base;
}

/**
 * Full Intern Finder pass: OpenSea asks + Intern Exchange desk inventory.
 * OpenSea failures are soft when desks (or a baked snapshot) can still fill
 * the board — production may lag a gg-index listings deploy.
 */
export async function findInterns(data, {
  limit = 25,
  includeOpenSea = true,
  includeDesk = true,
  onProgress,
  onPartial,
  signal,
} = {}) {
  const note = (msg) => { if (onProgress) onProgress(msg); };
  let os = { rows: [], titleEngineLive: false };
  let book = { fetchedAt: '', listings: [], source: '' };
  let warning = '';

  if (includeOpenSea) {
    note('Loading OpenSea intern asks…');
    try {
      book = await loadInternListings(limit, {
        baked: data?.projects?.interns?.market?.floorListings || [],
      });
      if (book.source === 'snapshot') {
        warning = 'OpenSea live index unavailable — using the last hourly snapshot.';
      }
      note(`Pricing ${book.listings.length} OpenSea asks…`);
      os = await enrichInternListings(book.listings, data, { onPartial });
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      warning = err?.message || 'OpenSea intern listings failed.';
      note(warning);
      if (!includeDesk) throw err;
    }
  }

  let deskRows = [];
  if (includeDesk) {
    const vault = ANVIL_VAULTS.find((v) => v.key === 'interns');
    if (vault) {
      note('Scanning Intern Exchange desks…');
      try {
        const scan = await scanAnvilVault('interns', data, {
          signal,
          onProgress: (msg) => note(msg),
        });
        let quote = null;
        if (scan.rows[0]) {
          try {
            const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
            quote = await quoteAnvilSnipe(provider, vault.ammCa, scan.rows[0].tokenId);
          } catch {
            quote = null;
          }
        }
        deskRows = (scan.rows || [])
          .filter((row) => (Number(row.usd) || 0) > 0 || (row.holdings || []).length > 0)
          .slice(0, limit)
          .map((row) => deskRowFromVault(row, data, vault, quote || scan.snipe, os.titleEngineLive));
      } catch (err) {
        if (signal?.aborted || err?.name === 'AbortError') throw err;
        note(err?.message || 'Desk scan skipped.');
        if (!os.rows.length) throw err;
        warning = warning
          ? `${warning} Desk scan also failed.`
          : (err?.message || 'Desk scan failed.');
      }
    }
  }

  const rows = rankInternRows([...os.rows, ...deskRows], 'opportunity');
  if (!rows.length) {
    throw new Error(warning || 'No intern listings found on OpenSea or desks.');
  }
  return {
    rows,
    openSeaCount: os.rows.length,
    deskCount: deskRows.length,
    fetchedAt: book.fetchedAt,
    titleEngineLive: os.titleEngineLive,
    source: book.source || (deskRows.length ? 'desk' : ''),
    warning,
  };
}
