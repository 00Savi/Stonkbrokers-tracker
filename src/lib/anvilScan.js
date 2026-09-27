import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import { DEFAULT_TBA } from './airdropCommunities';

/**
 * Anvil AMM vaults. These collections are not enumerable, so a vault's NFTs
 * are the token ids whose ownerOf is the AMM. Addresses match fetcher.cjs.
 */
export const ANVIL_VAULTS = [
  {
    id: 'stonk',
    key: 'stonk',
    name: 'StonkBrokers',
    ticker: 'STONK',
    tokenSymbol: 'Stonkbroker',
    nftSymbol: 'Stonkbroker',
    nftCa: '0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0',
    tokenCa: '0xe934e36a439c94017b64a3fece66af12099abf50',
    ammCa: '0xe302733accf4800146e55fc45b46b4e4ffc032d2',
    maxSupply: 4444,
    firstId: 1,
  },
  {
    id: 'interns',
    key: 'interns',
    name: 'Interns',
    ticker: 'STONKBROKER',
    tokenSymbol: 'Stonkbroker',
    nftSymbol: 'Interns',
    nftCa: '0xfc4b0c4f464dc3037cf013934648a8a726d565a5',
    tokenCa: '0xe934e36a439c94017b64a3fece66af12099abf50',
    ammCa: '0xdea32d8aee85b41a0f320ff823e4625aab01f518',
    maxSupply: 8888,
    firstId: 1,
  },
  {
    id: 'mancer',
    key: 'mancer',
    name: 'Mancer',
    ticker: 'MANCER',
    nftCa: '0x797a2e030b7e49107c8f07bf0300ea9cae88ca57',
    tokenCa: '0xc72f232a6869e6cf34dc06129affd07f8a2a246a',
    ammCa: '0x2554cad3d851381ec1a16b7bf7b4737ed46b40fe',
    maxSupply: 5000,
    firstId: 1,
  },
  {
    id: 'tickeryard',
    key: 'tickeryard',
    name: 'TickerYard',
    ticker: 'YARD',
    nftCa: '0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97',
    tokenCa: '0xe3fa12da7fa026b21817f16622e8ae48fa785166',
    ammCa: '0xfe0b24a3b4052ad78f10fa75a27118c3e54a00e6',
    maxSupply: 3333,
    firstId: 1,
  },
  {
    id: 'cardwall',
    key: 'cardwall',
    name: 'The Card Wall',
    ticker: 'WALL',
    nftSymbol: 'Wall',
    nftCa: '0x890215157dbec26d67605324271b34ba05ee9e58',
    tokenCa: '0xb03058b8a39f3967df08d833682c1c99b29821b1',
    ammCa: '0xdd59536f394c4b589e695f5921723b89ea479379',
    maxSupply: 4444,
    firstId: 1,
  },
  faction('ghosts', 'Ghosts', 'GHOSTS',
    '0x7cd6e36286f92f55cc8f498e36e10a975a332aac',
    '0xd6b619a75667cfcc827a3b9b75d807d98b5456d2',
    '0x5c13f5f4bc85205e3aab278f7007b1c17bc958ea'),
  faction('zombies', 'Zombies', 'ZOMBIES',
    '0xcc87ff3b3c08fc04c1f60f54989eb7dfab3e0b31',
    '0xe4bef9d0845a13bd39c57c7ee4463ff5d0cc20b6',
    '0xf816103f6a9722b9256f3ede7d85d9495e46c32d'),
  faction('knights', 'Knights', 'KNIGHTS',
    '0x63a405ef2d9937675925ac8a99ce1694bcfd2922',
    '0xb6062468073a43c79cd7fd07fbe496da9ef544c3',
    '0xfd5888e566945d594596bfd6cd60cbbb924553a9'),
  faction('watchers', 'Watchers', 'WATCHERS',
    '0x291cbcd1e9f44724ed5acbdc6e1ddd72b28f7911',
    '0x4ffefdfefc16daac253140125f50d8be9baffa52',
    '0x51bc21f0965ed9344a16c62923af1c68deaf6fab'),
];

const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const SLAB = '0x8565507566c6a79b57e4eaa70b8232a64003d352';
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
const CHUNK = 400;

const OWNER_OF = new ethers.Interface(['function ownerOf(uint256) view returns (address)']);
const RARITY_OF = new ethers.Interface(['function rarityOf(uint256) view returns (uint256)']);
const ACCOUNT = new ethers.Interface([
  'function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)',
]);
const ERC20 = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const MULTICALL_ABI = [
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[])',
];

function faction(id, label, ticker, nftCa, tokenCa, ammCa) {
  return {
    id: `nightshades:${id}`,
    key: 'nightshades',
    faction: id,
    name: `Nightshades ${label}`,
    ticker,
    nftCa,
    tokenCa,
    ammCa,
    maxSupply: 3000,
    firstId: 1,
  };
}

export function anvilVaultById(id) {
  return ANVIL_VAULTS.find((v) => v.id === id) || null;
}

/** Card Wall rarityOf is 0–4. The membership metadata draws that as 1–5 stars. */
export function wallStars(rarity) {
  const n = Number(rarity);
  if (!Number.isInteger(n) || n < 0 || n > 4) return null;
  return n + 1;
}

export function rankVaultRows(rows, sort = 'value') {
  const copy = [...(rows || [])];
  if (sort === 'id') copy.sort((a, b) => a.tokenId - b.tokenId);
  else copy.sort((a, b) => (b.usd - a.usd) || (b.nftCount - a.nftCount) || (a.tokenId - b.tokenId));
  return copy;
}

function marketOf(data, vault) {
  if (vault.faction) return data?.projects?.nightshades?.factions?.[vault.faction]?.market || {};
  return data?.projects?.[vault.key]?.market || {};
}

function ethPrice(data) {
  return Number(data?.projects?.stonk?.market?.ethPriceUsd) || 0;
}

function floorUsd(data, vault) {
  const market = marketOf(data, vault);
  const eth = Number(market.ethPriceUsd) || ethPrice(data);
  return (Number(market.nftFloorEth) || 0) * eth;
}

function tokenPrice(data, vault) {
  return Number(marketOf(data, vault).tokenPriceUsd) || 0;
}

function uniqTokens(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const ca = String(row.ca || '').toLowerCase();
    if (!ethers.isAddress(ca) || seen.has(ca)) continue;
    seen.add(ca);
    out.push({ ...row, ca });
  }
  return out;
}

function protocolTokens(data) {
  const rows = [];
  for (const vault of ANVIL_VAULTS) {
    const price = tokenPrice(data, vault);
    if (price > 0) rows.push({ ca: vault.tokenCa, symbol: vault.tokenSymbol || vault.ticker, price, nft: false });
  }
  rows.push({ ca: USDG, symbol: 'USDG', price: 1, decimals: 6, nft: false });
  const eth = ethPrice(data);
  if (eth > 0) rows.push({ ca: WETH, symbol: 'WETH', price: eth, nft: false });
  return uniqTokens(rows);
}

function nftAssets(data) {
  const rows = ANVIL_VAULTS.map((vault) => ({
    ca: vault.nftCa,
    symbol: vault.nftSymbol || `${vault.ticker} NFT`,
    price: floorUsd(data, vault),
    nft: true,
    decimals: 0,
  }));
  rows.push({ ca: SLAB, symbol: 'SLAB', price: 0, nft: true, decimals: 0 });
  return uniqTokens(rows);
}

function marketTokens(data, already) {
  const skip = new Set(already.map((t) => t.ca));
  const rows = [];
  for (const t of [...(data?.memes || []), ...(data?.stocks || [])]) {
    const derived = t.totalSupply > 0 && t.fdv > 0 ? t.fdv / t.totalSupply : 0;
    const price = Number(t.priceUsd) || derived;
    if (!t.ca || !(price > 0)) continue;
    rows.push({ ca: t.ca, symbol: t.name || t.ca.slice(0, 6), price, nft: false });
  }
  return uniqTokens(rows).filter((t) => !skip.has(t.ca));
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

async function tryAggregate(mc, calls, signal) {
  if (signal?.aborted) throw abortError();
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await mc.tryAggregate.staticCall(false, calls);
    } catch (err) {
      last = err;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last || new Error('Chain read failed.');
}

async function mapChunks(items, fn, { onStep, signal } = {}) {
  const out = [];
  const chunks = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw abortError();
    out.push(...(await fn(chunks[i], i)));
    if (onStep) onStep(Math.min(items.length, (i + 1) * CHUNK), items.length);
  }
  return out;
}

function priceRow(row) {
  let usd = 0;
  let nftCount = 0;
  for (const h of row.holdings) {
    usd += h.usd || 0;
    if (h.nft) nftCount += h.amount;
  }
  row.usd = usd;
  row.nftCount = nftCount;
}

function snapshot(rows) {
  return rows.map((row) => ({
    ...row,
    holdings: [...row.holdings].sort((a, b) => (b.usd - a.usd) || a.symbol.localeCompare(b.symbol)),
  }));
}

async function readBalances(mc, rows, token, signal) {
  const dataFor = (row) => ERC20.encodeFunctionData('balanceOf', [row.tba]);
  const amounts = await mapChunks(rows, async (slice) => {
    const packed = slice.map((row) => ({ target: token.ca, callData: dataFor(row) }));
    const returned = await tryAggregate(mc, packed, signal);
    return returned.map((item) => (item.success ? decodeUint(item.returnData) : 0n));
  }, { signal });
  return amounts;
}

function addHolding(row, token, raw) {
  if (raw <= 0n) return;
  const decimals = token.nft ? 0 : (token.decimals ?? 18);
  const amount = token.nft ? Number(raw) : Number(ethers.formatUnits(raw, decimals));
  if (!(amount > 0)) return;
  const existing = row.holdings.find((h) => h.contract === token.ca);
  const usd = token.nft ? amount * (token.price || 0) : amount * (token.price || 0);
  if (existing) {
    existing.amount += amount;
    existing.usd += usd;
    return;
  }
  row.holdings.push({
    contract: token.ca,
    symbol: token.symbol,
    amount,
    usd,
    nft: !!token.nft,
  });
}

async function applyToken(mc, rows, token, signal) {
  const amounts = await readBalances(mc, rows, token, signal);
  amounts.forEach((raw, i) => addHolding(rows[i], token, raw));
}

async function withDecimals(mc, tokens, signal) {
  const pending = tokens.filter((t) => t.decimals == null && !t.nft);
  if (!pending.length) return tokens;
  const packed = pending.map((t) => ({
    target: t.ca,
    callData: ERC20.encodeFunctionData('decimals', []),
  }));
  const returned = await mapChunks(packed, (slice) => tryAggregate(mc, slice, signal), { signal });
  pending.forEach((token, i) => {
    const item = returned[i];
    const n = item?.success ? Number(decodeUint(item.returnData)) : 18;
    token.decimals = Number.isFinite(n) && n >= 0 && n <= 36 ? n : 18;
  });
  return tokens;
}

/**
 * Wall NFTs inside these token-bound wallets, with each membership's star
 * rating. One owner scan of the collection, then rarityOf on the matches.
 */
async function attachWallStars(mc, rows, signal, report) {
  const wall = anvilVaultById('cardwall');
  const wallCa = wall.nftCa.toLowerCase();
  const holders = rows.filter((row) => row.holdings.some((h) => h.contract === wallCa && h.nft && h.amount > 0));
  if (!holders.length) return;

  const tbaSet = new Set(holders.map((row) => row.tba.toLowerCase()));
  const ids = [];
  for (let id = wall.firstId; id < wall.firstId + wall.maxSupply; id++) ids.push(id);
  const matched = [];
  await mapChunks(ids, async (slice) => {
    const packed = slice.map((id) => ({
      target: wall.nftCa,
      callData: OWNER_OF.encodeFunctionData('ownerOf', [id]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    returned.forEach((item, i) => {
      if (!item.success) return;
      const owner = decodeAddress(item.returnData);
      if (owner && tbaSet.has(owner.toLowerCase())) matched.push({ id: slice[i], owner: owner.toLowerCase() });
    });
    return [];
  }, {
    signal,
    onStep: (done, total) => report('Reading Wall star ratings…', done, total),
  });
  if (!matched.length) return;

  const rarities = await mapChunks(matched, async (slice) => {
    const packed = slice.map((row) => ({
      target: wall.nftCa,
      callData: RARITY_OF.encodeFunctionData('rarityOf', [row.id]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    return returned.map((item) => (item.success ? wallStars(decodeUint(item.returnData)) : null));
  }, { signal });

  const byOwner = new Map();
  matched.forEach((row, i) => {
    const stars = rarities[i];
    if (stars == null) return;
    const list = byOwner.get(row.owner) || [];
    list.push({ tokenId: row.id, stars });
    byOwner.set(row.owner, list);
  });

  for (const row of holders) {
    const pieces = byOwner.get(row.tba.toLowerCase());
    if (!pieces?.length) continue;
    const holding = row.holdings.find((h) => h.contract === wallCa);
    if (!holding) continue;
    pieces.sort((a, b) => b.stars - a.stars || a.tokenId - b.tokenId);
    holding.pieces = pieces;
    holding.stars = pieces.map((p) => p.stars);
  }
}

function abortError() {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * NFTs sitting in one project's AMM, ranked by the priced contents of each
 * token-bound wallet. Calls `onPartial` once protocol tokens and Anvil NFTs
 * are priced, then again as market tokens fill in.
 */
export async function scanAnvilVault(vaultId, data, { onProgress, onPartial, signal } = {}) {
  const vault = anvilVaultById(vaultId);
  if (!vault) throw new Error('Pick a supported project.');

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const mc = new ethers.Contract(MULTICALL, MULTICALL_ABI, provider);
  const nft = new ethers.Contract(vault.nftCa, ['function balanceOf(address) view returns (uint256)'], provider);
  const vaultBalance = Number(await nft.balanceOf(vault.ammCa));

  const report = (label, done, total) => {
    if (onProgress) onProgress({ label, done, total });
  };

  if (!(vaultBalance > 0)) {
    return { vault, vaultBalance: 0, rows: [] };
  }

  report(`Finding NFTs in the ${vault.name} vault…`, 0, vault.maxSupply);
  const ownerCalls = [];
  for (let id = vault.firstId; id < vault.firstId + vault.maxSupply; id++) {
    ownerCalls.push({
      id,
      target: vault.nftCa,
      callData: OWNER_OF.encodeFunctionData('ownerOf', [id]),
    });
  }
  const amm = vault.ammCa.toLowerCase();
  const ownedIds = [];
  await mapChunks(ownerCalls, async (slice) => {
    const returned = await tryAggregate(mc, slice.map((c) => ({ target: c.target, callData: c.callData })), signal);
    returned.forEach((item, i) => {
      if (!item.success) return;
      const owner = decodeAddress(item.returnData);
      if (owner && owner.toLowerCase() === amm) ownedIds.push(slice[i].id);
    });
    return [];
  }, {
    signal,
    onStep: (done, total) => report(`Finding NFTs in the ${vault.name} vault…`, done, total),
  });

  report(`Resolving ${ownedIds.length} token-bound wallets…`, 0, ownedIds.length);
  const tbaById = new Map();
  await mapChunks(ownedIds, async (slice) => {
    const packed = slice.map((id) => ({
      target: DEFAULT_TBA.registry,
      callData: ACCOUNT.encodeFunctionData('account', [
        DEFAULT_TBA.implementation,
        DEFAULT_TBA.salt,
        DEFAULT_TBA.chainId,
        vault.nftCa,
        id,
      ]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    returned.forEach((item, i) => {
      if (item.success) tbaById.set(slice[i], decodeAddress(item.returnData));
    });
    return [];
  }, {
    signal,
    onStep: (done, total) => report('Resolving token-bound wallets…', done, total),
  });

  const rows = ownedIds
    .filter((id) => tbaById.get(id))
    .map((tokenId) => ({
      tokenId,
      tba: tbaById.get(tokenId),
      usd: 0,
      nftCount: 0,
      holdings: [],
    }));

  const eth = ethPrice(data);
  if (eth > 0 && rows.length) {
    report('Reading ETH in token-bound wallets…', 0, rows.length);
    const bals = [];
    await mapChunks(rows, async (slice) => {
      const packed = slice.map((row) => ({
        target: MULTICALL,
        callData: new ethers.Interface(['function getEthBalance(address) view returns (uint256)'])
          .encodeFunctionData('getEthBalance', [row.tba]),
      }));
      const returned = await tryAggregate(mc, packed, signal);
      returned.forEach((item) => bals.push(item.success ? decodeUint(item.returnData) : 0n));
      return [];
    }, { signal });
    bals.forEach((raw, i) => {
      if (raw <= 0n) return;
      const amount = Number(ethers.formatEther(raw));
      rows[i].holdings.push({
        contract: 'native',
        symbol: 'ETH',
        amount,
        usd: amount * eth,
        nft: false,
      });
    });
  }

  const publish = () => {
    rows.forEach(priceRow);
    if (onPartial) onPartial(snapshot(rows), vaultBalance);
  };

  const fungible = protocolTokens(data);
  await withDecimals(mc, fungible, signal);
  const ownCa = vault.tokenCa.toLowerCase();
  for (let i = 0; i < fungible.length; i++) {
    report(`Reading ${fungible[i].symbol}…`, i, fungible.length);
    await applyToken(mc, rows, fungible[i], signal);
    if (fungible[i].ca === ownCa) publish();
  }

  const nfts = nftAssets(data);
  for (let i = 0; i < nfts.length; i++) {
    report(`Reading ${nfts[i].symbol} balances…`, i, nfts.length);
    await applyToken(mc, rows, nfts[i], signal);
  }

  await attachWallStars(mc, rows, signal, report);
  publish();

  // A full stock list against every vault NFT is tens of thousands of reads.
  // Wallets that already hold ETH, an Anvil token, or an NFT are the ones
  // worth pricing further; the table is already on screen from onPartial.
  const funded = rows.filter((row) => row.holdings.length > 0);
  const markets = funded.length ? marketTokens(data, fungible) : [];
  await withDecimals(mc, markets, signal);
  for (let i = 0; i < markets.length; i++) {
    report('Pricing market tokens…', i + 1, markets.length);
    await applyToken(mc, funded, markets[i], signal);
    if ((i + 1) % 25 === 0 || i === markets.length - 1) publish();
  }

  rows.forEach(priceRow);
  return { vault, vaultBalance, rows: snapshot(rows) };
}
