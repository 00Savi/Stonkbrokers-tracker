import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import { DEFAULT_TBA } from './airdropCommunities';
import { internIdsForBroker } from './interns';
import { loadVaultBook } from './ggindex';

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
    activationCa: '0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664',
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
    activationCa: '0x668ea9e44e0ceb5b203067873e0b9bcdf2214b37',
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
const CHUNK = 800;
// One balance multicall can cover a whole vault. Owner scans stay at CHUNK.
const BALANCE_CHUNK = 2500;
const READ_POOL = 6;

const OWNER_OF = new ethers.Interface(['function ownerOf(uint256) view returns (address)']);
const RARITY_OF = new ethers.Interface(['function rarityOf(uint256) view returns (uint256)']);
const ACCOUNT = new ethers.Interface([
  'function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)',
]);
const ERC20 = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const ACTIVATION_OF = new ethers.Interface([
  'function activationOf(uint256) view returns (uint256 active, uint256 tier)',
]);
const IS_DORMANT = new ethers.Interface([
  'function isDormant(uint256) view returns (bool)',
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

/** OpenSea floor for this star count, or the collection floor when that star has no listing. */
export function wallFloorEth(stars, market) {
  const idx = Number(stars) - 1;
  const listed = Array.isArray(market?.starFloorEth) ? Number(market.starFloorEth[idx]) : 0;
  if (listed > 0) return listed;
  return Number(market?.nftFloorEth) || 0;
}

/** What the scan reads. Stocks and memes are the long tail. */
export const SCAN_INCLUDE = {
  tokens: true,
  nfts: true,
  stars: true,
  interns: true,
  stocks: true,
  memes: true,
};

export function internFloorUsd(data) {
  const market = data?.projects?.interns?.market || {};
  const eth = Number(market.ethPriceUsd) || Number(data?.projects?.stonk?.market?.ethPriceUsd) || 0;
  return (Number(market.nftFloorEth) || 0) * eth;
}

/**
 * In the parent TBA and not yet activated, with an activated broker: the intern
 * can still be turned on, so the wallet total includes the OpenSea floor.
 * Already activated, or dormant under a broker that is off, is shown and not priced.
 */
export function internRowState({ inWallet, dormant, parentActive }) {
  if (!inWallet) return null;
  if (!dormant) return 'activated';
  return parentActive ? 'canActivate' : 'dormant';
}

const INTERN_MARK = { sigma: 'Σ', divergent: 'Δ' };
const INTERN_LABEL = { canActivate: 'can activate', activated: 'activated', dormant: 'dormant' };

export function internStatusLine(interns) {
  const shown = (interns || []).filter((row) => row.state);
  if (!shown.length) return '';
  return shown.map((row) => `${INTERN_MARK[row.klass] || 'Intern'} ${INTERN_LABEL[row.state] || row.state}`).join(' · ');
}

const SNIPE_QUOTE = new ethers.Interface([
  'function quoteSpecificBuy(uint256 tokenId) view returns (uint256 tokens, uint256 eth)',
  'function specificFeeBps() view returns (uint16)',
]);

/**
 * What it costs to buy one specific NFT out of this vault.
 *
 * `tokens` is the whole-token amount (666,666 Stonkbroker). `eth` is the
 * specific-buy leg, `specificFeeBps` of that token value, paid in ETH.
 * A random buy is a cheaper fee and is not this quote.
 */
export async function quoteAnvilSnipe(provider, ammCa, tokenId) {
  const data = SNIPE_QUOTE.encodeFunctionData('quoteSpecificBuy', [tokenId]);
  const feeData = SNIPE_QUOTE.encodeFunctionData('specificFeeBps', []);
  const [quotedRaw, feeRaw] = await Promise.all([
    provider.call({ to: ammCa, data }),
    provider.call({ to: ammCa, data: feeData }),
  ]);
  const [tokensRaw, ethRaw] = SNIPE_QUOTE.decodeFunctionResult('quoteSpecificBuy', quotedRaw);
  const [feeBps] = SNIPE_QUOTE.decodeFunctionResult('specificFeeBps', feeRaw);
  return {
    tokens: Number(ethers.formatUnits(tokensRaw, 18)),
    eth: Number(ethers.formatEther(ethRaw)),
    feeBps: Number(feeBps),
  };
}

/** Token leg at spot, plus the ETH leg the vault just quoted. */
export function snipeCostFor(data, vault, quote) {
  if (!vault || !quote || !(quote.tokens > 0) || !(quote.feeBps > 0)) return null;
  const tokenUsd = tokenPrice(data, vault);
  const ethUsd = Number(marketOf(data, vault).ethPriceUsd) || ethPrice(data);
  if (!(tokenUsd > 0) || !(ethUsd > 0) || !(quote.eth >= 0)) return null;
  const tokenLegUsd = quote.tokens * tokenUsd;
  const ethLegUsd = quote.eth * ethUsd;
  return {
    usd: tokenLegUsd + ethLegUsd,
    eth: tokenLegUsd / ethUsd + quote.eth,
    tokens: quote.tokens,
    ethLeg: quote.eth,
    feeBps: quote.feeBps,
    ticker: vault.ticker || '',
    ethUsd,
  };
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
    // Wall value depends on the star rating. Intern value depends on whether
    // that intern can still be activated, applied after those reads.
    price: vault.id === 'cardwall' || vault.id === 'interns' ? 0 : floorUsd(data, vault),
    nft: true,
    decimals: 0,
  }));
  rows.push({ ca: SLAB, symbol: 'SLAB', price: 0, nft: true, decimals: 0 });
  return uniqTokens(rows);
}

function pricedMarketRows(rows, kind) {
  const out = [];
  for (const t of rows || []) {
    const derived = t.totalSupply > 0 && t.fdv > 0 ? t.fdv / t.totalSupply : 0;
    const price = Number(t.priceUsd) || derived;
    if (!t.ca || !(price > 0)) continue;
    out.push({
      ca: String(t.ca).toLowerCase(),
      symbol: t.name || String(t.ca).slice(0, 6),
      price,
      nft: false,
      kind,
    });
  }
  return uniqTokens(out);
}

/** Stocks first, then memes. Protocol tokens already read on the scan are left out. */
function splitMarkets(data, fungible) {
  const skip = new Set((fungible || []).map((t) => t.ca));
  const stocks = pricedMarketRows(data?.stocks, 'stock').filter((t) => !skip.has(t.ca));
  const memes = pricedMarketRows(data?.memes, 'meme').filter((t) => !skip.has(t.ca));
  return { stocks, memes };
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

function decodeWord(data, index = 0) {
  const body = String(data || '').replace(/^0x/, '');
  const slice = body.slice(index * 64, (index + 1) * 64);
  if (!slice) return 0n;
  try {
    return BigInt(`0x${slice}`);
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

function chunkItems(items, size = CHUNK) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** ERC-6551 registry CREATE2. Confirmed against account() before a scan trusts it. */
export function predictTbaAddress(nftCa, tokenId) {
  const implementation = DEFAULT_TBA.implementation;
  const initCode = ethers.concat([
    '0x3d60ad80600a3d3981f3363d3d373d3d3d363d73',
    implementation,
    '0x5af43d82803e903d91602b57fd5bf3',
  ]);
  const bytecodeHash = ethers.keccak256(initCode);
  const saltHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'address', 'uint256'],
      [DEFAULT_TBA.salt, DEFAULT_TBA.chainId, nftCa, tokenId],
    ),
  );
  return ethers.getCreate2Address(DEFAULT_TBA.registry, saltHash, bytecodeHash);
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

async function mapChunksPooled(items, fn, { onStep, signal, limit = READ_POOL, size = CHUNK } = {}) {
  const chunks = chunkItems(items, size);
  let done = 0;
  const parts = await mapPool(chunks, limit, async (slice) => {
    const out = await fn(slice);
    done += slice.length;
    if (onStep) onStep(Math.min(items.length, done), items.length);
    return out;
  }, signal);
  return parts.flat();
}

async function mapPool(items, limit, fn, signal) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (signal?.aborted) throw abortError();
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
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
  const amounts = await mapChunksPooled(rows, async (slice) => {
    const packed = slice.map((row) => ({ target: token.ca, callData: dataFor(row) }));
    const returned = await tryAggregate(mc, packed, signal);
    return returned.map((item) => (item.success ? decodeUint(item.returnData) : 0n));
  }, { signal, size: BALANCE_CHUNK });
  return amounts.flat();
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

/** Several balanceOf reads in one multicall, still capped at CHUNK, three calls in flight. */
async function applyTokenGroup(mc, rows, tokens, signal, onStep) {
  const list = (tokens || []).filter((token) => token?.ca);
  if (!rows.length || !list.length) return;
  const width = Math.max(1, Math.floor(CHUNK / list.length));
  await mapChunksPooled(rows, async (slice) => {
    const packed = [];
    for (const token of list) {
      for (const row of slice) {
        packed.push({
          target: token.ca,
          callData: ERC20.encodeFunctionData('balanceOf', [row.tba]),
        });
      }
    }
    const returned = await tryAggregate(mc, packed, signal);
    let cursor = 0;
    for (const token of list) {
      for (const row of slice) {
        const item = returned[cursor++];
        addHolding(row, token, item?.success ? decodeUint(item.returnData) : 0n);
      }
    }
    return [];
  }, {
    signal,
    size: width,
    onStep,
  });
}

async function accountOnChain(mc, nftCa, tokenId, signal) {
  const returned = await tryAggregate(mc, [{
    target: DEFAULT_TBA.registry,
    callData: ACCOUNT.encodeFunctionData('account', [
      DEFAULT_TBA.implementation,
      DEFAULT_TBA.salt,
      DEFAULT_TBA.chainId,
      nftCa,
      tokenId,
    ]),
  }], signal);
  const item = returned[0];
  return item?.success ? decodeAddress(item.returnData) : null;
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
  await mapChunksPooled(ids, async (slice) => {
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

/**
 * Sigma (#N) and Divergent (#N+4444) still sitting in this broker's TBA.
 * A dormant intern under an activated broker is priced at the Intern floor.
 */
/**
 * Star ratings for Wall ids the vault book already placed in these wallets.
 * rarityOf only — the collection owner scan stays on the live path.
 */
async function fillWallStars(mc, rows, signal, report) {
  const wall = anvilVaultById('cardwall');
  const wallCa = wall.nftCa.toLowerCase();
  const jobs = [];
  for (const row of rows) {
    const holding = row.holdings.find((h) => h.contract === wallCa && h.nft);
    for (const piece of holding?.pieces || []) {
      if (piece.stars == null) jobs.push(piece);
    }
  }
  if (!jobs.length) return;
  const rarities = await mapChunks(jobs, async (slice) => {
    const packed = slice.map((piece) => ({
      target: wall.nftCa,
      callData: RARITY_OF.encodeFunctionData('rarityOf', [piece.tokenId]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    return returned.map((item) => (item.success ? wallStars(decodeUint(item.returnData)) : null));
  }, {
    signal,
    onStep: (done, total) => report('Reading Wall star ratings…', done, total),
  });
  jobs.forEach((piece, i) => {
    if (rarities[i] != null) piece.stars = rarities[i];
  });
  for (const row of rows) {
    const holding = row.holdings.find((h) => h.contract === wallCa && h.nft);
    if (!holding?.pieces?.length) continue;
    holding.pieces.sort((a, b) => (b.stars || 0) - (a.stars || 0) || a.tokenId - b.tokenId);
    holding.stars = holding.pieces.map((p) => p.stars).filter((n) => n != null);
  }
}

/**
 * Vault membership and the catalog balances gg-index has already folded.
 * Null when the book is incomplete, the TBA math disagrees, or a raw balance
 * is not an integer. Ready tokens with no row are zero. Pending tokens are
 * left for the live multicall.
 */
export function rowsFromVaultBook(vault, book, fungible, nfts) {
  if (!book?.membership_complete || !Array.isArray(book.pieces)) return null;
  if (book.pieces.length !== Number(book.count)) return null;
  const readyTokens = new Set((book.ready_tokens || []).map((a) => String(a).toLowerCase()));
  const readyCols = new Set((book.ready_collections || []).map((a) => String(a).toLowerCase()));
  const tokenBy = new Map((fungible || []).map((t) => [String(t.ca).toLowerCase(), t]));
  const nftBy = new Map((nfts || []).map((t) => [String(t.ca).toLowerCase(), t]));
  const wallCa = anvilVaultById('cardwall').nftCa.toLowerCase();
  const rows = [];
  for (const piece of book.pieces) {
    const tokenId = Number(piece.token_id);
    if (!Number.isInteger(tokenId)) return null;
    const tba = predictTbaAddress(vault.nftCa, tokenId);
    if (!piece.tba || piece.tba.toLowerCase() !== tba.toLowerCase()) return null;
    const row = { tokenId, tba, usd: 0, nftCount: 0, holdings: [] };
    for (const bal of piece.tokens || []) {
      const token = tokenBy.get(String(bal.address || '').toLowerCase());
      if (!token || !readyTokens.has(String(token.ca).toLowerCase())) continue;
      let raw;
      try {
        raw = BigInt(bal.raw);
      } catch {
        return null;
      }
      addHolding(row, token, raw);
    }
    for (const group of piece.nfts || []) {
      const ca = String(group.collection || '').toLowerCase();
      const token = nftBy.get(ca);
      if (!token || !readyCols.has(ca)) continue;
      const ids = [];
      for (const id of group.token_ids || []) {
        const n = Number(id);
        if (!Number.isInteger(n)) return null;
        ids.push(n);
      }
      addHolding(row, token, BigInt(ids.length));
      if (ca === wallCa) {
        const holding = row.holdings.find((h) => h.contract === token.ca);
        if (holding) holding.pieces = ids.map((id) => ({ tokenId: id, stars: null }));
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.tokenId - b.tokenId);
  return { rows, readyTokens, readyCols };
}

function internMapFromBook(book, internCa) {
  const ready = new Set((book?.ready_collections || []).map((a) => String(a).toLowerCase()));
  if (!ready.has(String(internCa).toLowerCase())) return null;
  const map = new Map();
  for (const piece of book.pieces || []) {
    const ids = new Set();
    for (const group of piece.nfts || []) {
      if (String(group.collection || '').toLowerCase() !== String(internCa).toLowerCase()) continue;
      for (const id of group.token_ids || []) {
        const n = Number(id);
        if (Number.isInteger(n)) ids.add(n);
      }
    }
    map.set(Number(piece.token_id), ids);
  }
  return map;
}

async function attachInterns(mc, rows, data, signal, report, known) {
  const stonk = anvilVaultById('stonk');
  const intern = anvilVaultById('interns');
  const floor = internFloorUsd(data);
  const pairs = [];
  for (const row of rows) {
    for (const spec of internIdsForBroker(row.tokenId)) pairs.push({ row, ...spec });
  }
  if (!pairs.length) return;

  let held;
  if (known) {
    report('Reading interns…', pairs.length, pairs.length);
    held = pairs.filter((pair) => known.get(pair.row.tokenId)?.has(pair.id));
  } else {
    const owners = await mapChunksPooled(pairs, async (slice) => {
      const packed = slice.map((pair) => ({
        target: intern.nftCa,
        callData: OWNER_OF.encodeFunctionData('ownerOf', [pair.id]),
      }));
      const returned = await tryAggregate(mc, packed, signal);
      return returned.map((item) => (item.success ? decodeAddress(item.returnData) : null));
    }, {
      signal,
      onStep: (done, total) => report('Reading interns…', done, total),
    });

    held = [];
    pairs.forEach((pair, i) => {
      const owner = owners[i];
      if (owner && owner.toLowerCase() === pair.row.tba.toLowerCase()) held.push(pair);
    });
  }

  const dormantFlags = await mapChunksPooled(held, async (slice) => {
    if (!slice.length) return [];
    const packed = slice.map((pair) => ({
      target: intern.nftCa,
      callData: IS_DORMANT.encodeFunctionData('isDormant', [pair.id]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    return returned.map((item) => (item.success ? decodeWord(item.returnData) > 0n : null));
  }, { signal });

  const parentIds = [...new Set(held.filter((pair, i) => dormantFlags[i]).map((pair) => pair.row.tokenId))];
  const parentActive = new Map();
  await mapChunksPooled(parentIds, async (slice) => {
    if (!slice.length) return [];
    const packed = slice.map((id) => ({
      target: stonk.activationCa,
      callData: ACTIVATION_OF.encodeFunctionData('activationOf', [id]),
    }));
    const returned = await tryAggregate(mc, packed, signal);
    returned.forEach((item, i) => {
      parentActive.set(slice[i], item.success && decodeWord(item.returnData) > 0n);
    });
    return [];
  }, { signal });

  const byRow = new Map();
  held.forEach((pair, i) => {
    if (dormantFlags[i] == null) return;
    const state = internRowState({
      inWallet: true,
      dormant: dormantFlags[i],
      parentActive: !!parentActive.get(pair.row.tokenId),
    });
    const entry = {
      id: pair.id,
      klass: pair.klass,
      label: pair.label,
      state,
      usd: state === 'canActivate' ? floor : 0,
    };
    const list = byRow.get(pair.row) || [];
    list.push(entry);
    byRow.set(pair.row, list);
  });

  const internCa = intern.nftCa.toLowerCase();
  for (const row of rows) {
    const list = (byRow.get(row) || []).sort((a, b) => a.id - b.id);
    row.interns = list;
    row.holdings = row.holdings.filter((h) => h.contract !== internCa);
    const priced = list.filter((entry) => entry.usd > 0);
    if (!priced.length) continue;
    row.holdings.push({
      contract: internCa,
      symbol: 'Intern',
      amount: priced.length,
      usd: priced.reduce((sum, entry) => sum + entry.usd, 0),
      nft: true,
    });
  }
}

function applyWallFloors(rows, data) {
  const market = data?.projects?.cardwall?.market || {};
  const eth = Number(market.ethPriceUsd) || ethPrice(data);
  const wallCa = anvilVaultById('cardwall').nftCa.toLowerCase();
  const collection = Number(market.nftFloorEth) || 0;
  for (const row of rows) {
    const holding = row.holdings.find((h) => h.contract === wallCa && h.nft);
    if (!holding) continue;
    if (holding.pieces?.length) {
      let usd = 0;
      for (const piece of holding.pieces) {
        const floor = wallFloorEth(piece.stars, market);
        piece.floorEth = floor;
        piece.usd = floor * eth;
        usd += piece.usd;
      }
      holding.usd = usd;
      continue;
    }
    if (holding.amount > 0 && collection > 0) holding.usd = holding.amount * collection * eth;
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
 * token-bound wallet. Stocks are priced before memes. `onPlan` is the full
 * checklist; `onStep` flips each item to running, then done.
 */
export async function scanAnvilVault(vaultId, data, { onProgress, onPartial, onPlan, onStep, signal, include } = {}) {
  const vault = anvilVaultById(vaultId);
  if (!vault) throw new Error('Pick a supported project.');
  const parts = { ...SCAN_INCLUDE, ...(include || {}) };
  const readInterns = parts.interns && vault.id === 'stonk';

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const mc = new ethers.Contract(MULTICALL, MULTICALL_ABI, provider);
  const nft = new ethers.Contract(vault.nftCa, ['function balanceOf(address) view returns (uint256)'], provider);
  const bookPromise = loadVaultBook(vault.faction || vault.key, signal);
  const vaultBalance = Number(await nft.balanceOf(vault.ammCa));

  const report = (label, done, total) => {
    if (onProgress) onProgress({ label, done, total });
  };
  const mark = (id, status) => {
    if (onStep) onStep({ id, status });
  };

  const fungible = parts.tokens ? protocolTokens(data) : [];
  const internCa = anvilVaultById('interns').nftCa.toLowerCase();
  let nfts = parts.nfts ? nftAssets(data) : [];
  if (vault.id === 'stonk') nfts = nfts.filter((token) => token.ca !== internCa);
  const { stocks, memes } = splitMarkets(data, protocolTokens(data));
  const stockList = parts.stocks ? stocks : [];
  const memeList = parts.memes ? memes : [];
  const steps = [
    { id: 'vault', label: 'Vault NFTs', group: 'Vault' },
    { id: 'tba', label: 'TBA wallets', group: 'Vault' },
    { id: 'eth', label: 'ETH', group: 'Anvil' },
    ...fungible.map((t) => ({ id: `tok:${t.ca}`, label: t.symbol, group: 'Anvil' })),
    ...nfts.map((t) => ({ id: `nft:${t.ca}`, label: t.symbol, group: 'Anvil' })),
    ...(parts.stars && parts.nfts ? [{ id: 'stars', label: 'Wall stars', group: 'Anvil' }] : []),
    ...(readInterns ? [{ id: 'interns', label: 'Interns', group: 'Anvil' }] : []),
    ...stockList.map((t) => ({ id: `stock:${t.ca}`, label: t.symbol, group: 'Stocks' })),
    ...memeList.map((t) => ({ id: `meme:${t.ca}`, label: t.symbol, group: 'Memes' })),
  ];
  if (onPlan) onPlan(steps);

  if (!(vaultBalance > 0)) {
    bookPromise.catch(() => {});
    mark('vault', 'done');
    return { vault, vaultBalance: 0, rows: [], include: parts, snipe: null };
  }

  mark('vault', 'run');
  let rows = null;
  let readyTokens = new Set();
  let readyCols = new Set();
  let bookMeta = null;
  let internKnown = null;
  try {
    const book = await bookPromise;
    if (book?.membership_complete && Number(book.count) === vaultBalance) {
      await withDecimals(mc, fungible, signal);
      const built = rowsFromVaultBook(vault, book, fungible, nfts);
      if (built && built.rows.length === vaultBalance) {
        rows = built.rows;
        readyTokens = built.readyTokens;
        readyCols = built.readyCols;
        bookMeta = {
          throughBlock: book.through_block,
          headBlock: book.head_block,
        };
        if (readInterns) internKnown = internMapFromBook(book, internCa);
        const block = Number(book.through_block).toLocaleString('en-US');
        report(`Vault book at block ${block}`, vaultBalance, vaultBalance);
      }
    }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw err;
  }

  if (!rows) {
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
    await mapChunksPooled(ownerCalls, async (slice) => {
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

    mark('tba', 'run');
    const tbaById = new Map();
    report('Resolving token-bound wallets…', 0, ownedIds.length || 1);
    let tbaLocal = false;
    if (ownedIds.length >= 2) {
      const sample = [ownedIds[0], ownedIds[ownedIds.length - 1]];
      const checks = await Promise.all(sample.map(async (id) => {
        const onchain = await accountOnChain(mc, vault.nftCa, id, signal);
        const local = predictTbaAddress(vault.nftCa, id);
        return onchain && local && onchain.toLowerCase() === local.toLowerCase();
      }));
      tbaLocal = checks.every(Boolean);
    }
    if (tbaLocal) {
      for (const id of ownedIds) tbaById.set(id, predictTbaAddress(vault.nftCa, id));
      report('Resolving token-bound wallets…', ownedIds.length, ownedIds.length);
    } else {
      await mapChunksPooled(ownedIds, async (slice) => {
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
    }
    mark('tba', 'done');
    rows = ownedIds
      .filter((id) => tbaById.get(id))
      .map((tokenId) => ({
        tokenId,
        tba: tbaById.get(tokenId),
        usd: 0,
        nftCount: 0,
        holdings: [],
      }));
  }

  mark('vault', 'done');
  if (bookMeta) mark('tba', 'done');

  let snipe = null;
  const quoteId = rows[0]?.tokenId;
  if (quoteId) {
    try {
      snipe = await quoteAnvilSnipe(provider, vault.ammCa, quoteId);
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      snipe = null;
    }
  }

  const eth = ethPrice(data);
  mark('eth', 'run');
  if (eth > 0 && rows.length) {
    report('Reading ETH in token-bound wallets…', 0, rows.length);
    const ethIface = new ethers.Interface(['function getEthBalance(address) view returns (uint256)']);
    const bals = await mapChunksPooled(rows, async (slice) => {
      const packed = slice.map((row) => ({
        target: MULTICALL,
        callData: ethIface.encodeFunctionData('getEthBalance', [row.tba]),
      }));
      const returned = await tryAggregate(mc, packed, signal);
      return returned.map((item) => (item.success ? decodeUint(item.returnData) : 0n));
    }, {
      signal,
      size: BALANCE_CHUNK,
      onStep: (done, total) => report('Reading ETH in token-bound wallets…', done, total),
    });
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
  mark('eth', 'done');

  const publish = () => {
    rows.forEach(priceRow);
    if (onPartial) onPartial(snapshot(rows), vaultBalance, snipe, bookMeta);
  };
  if (bookMeta) publish();

  const covered = (token, ready) => ready.has(String(token.ca).toLowerCase());
  await withDecimals(mc, fungible, signal);
  const ownCa = vault.tokenCa.toLowerCase();
  const own = fungible.find((token) => token.ca === ownCa);
  const restFungible = fungible.filter((token) => token !== own);
  const liveOwn = own && !covered(own, readyTokens) ? own : null;
  const liveRest = restFungible.filter((token) => !covered(token, readyTokens));
  const liveNfts = nfts.filter((token) => !covered(token, readyCols));
  if (own && !liveOwn) mark(`tok:${own.ca}`, 'done');
  for (const token of restFungible) {
    if (!liveRest.includes(token)) mark(`tok:${token.ca}`, 'done');
  }
  for (const token of nfts) {
    if (!liveNfts.includes(token)) mark(`nft:${token.ca}`, 'done');
  }
  if (liveOwn) {
    mark(`tok:${liveOwn.ca}`, 'run');
    await applyTokenGroup(mc, rows, [liveOwn], signal, (done, total) => report(`Reading ${liveOwn.symbol}…`, done, total));
    mark(`tok:${liveOwn.ca}`, 'done');
    publish();
  }
  for (const token of liveRest) mark(`tok:${token.ca}`, 'run');
  if (liveRest.length) {
    await applyTokenGroup(mc, rows, liveRest, signal, (done, total) => report('Reading Anvil tokens…', done, total));
  }
  for (const token of liveRest) mark(`tok:${token.ca}`, 'done');

  for (const token of liveNfts) mark(`nft:${token.ca}`, 'run');
  if (liveNfts.length) {
    await applyTokenGroup(mc, rows, liveNfts, signal, (done, total) => report('Reading Anvil NFTs…', done, total));
  }
  for (const token of liveNfts) mark(`nft:${token.ca}`, 'done');

  if (parts.nfts) {
    if (parts.stars) {
      mark('stars', 'run');
      const wallCa = anvilVaultById('cardwall').nftCa.toLowerCase();
      if (readyCols.has(wallCa)) await fillWallStars(mc, rows, signal, report);
      else await attachWallStars(mc, rows, signal, report);
      mark('stars', 'done');
    }
    applyWallFloors(rows, data);
    publish();
  }

  if (readInterns) {
    mark('interns', 'run');
    await attachInterns(mc, rows, data, signal, report, internKnown);
    mark('interns', 'done');
    publish();
  }

  const funded = rows.filter((row) => row.holdings.length > 0 || (row.interns || []).length > 0);
  const queue = [...stockList, ...memeList];
  await withDecimals(mc, queue, signal);
  await mapPool(queue, READ_POOL, async (token) => {
    const id = `${token.kind}:${token.ca}`;
    mark(id, 'run');
    report(token.kind === 'stock' ? `Stock ${token.symbol}` : `Meme ${token.symbol}`, 0, 1);
    if (funded.length) await applyToken(mc, funded, token, signal);
    mark(id, 'done');
    publish();
  }, signal);

  rows.forEach(priceRow);
  return { vault, vaultBalance, rows: snapshot(rows), include: parts, snipe, book: bookMeta };
}
