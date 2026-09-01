import { ethers } from 'ethers';
import { AIRDROP_COMMUNITIES, DEFAULT_TBA } from './airdropCommunities';
import { ROBINHOOD_RPC } from './bonusTokenomics';

const REGISTRY_ABI = [
  'function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const ERC721_ABI = ['function balanceOf(address) view returns (uint256)'];

const EXPLORER_ADDR = 'https://robinhoodchain.blockscout.com/address';

/** Card Wall rain lands WrappedSolanaNft slabs in the membership TBA. */
const SLAB_NFT = {
  ca: '0x8565507566c6a79b57e4eaa70b8232a64003d352',
  symbol: 'SLAB',
  name: 'Card Wall slab',
};

export function explorerAddressUrl(address) {
  return `${EXPLORER_ADDR}/${address}`;
}

export function tbaRegistry(provider, cfg = {}) {
  const addr = cfg.tbaRegistry || DEFAULT_TBA.registry;
  return new ethers.Contract(addr, REGISTRY_ABI, provider);
}

export function resolveTbaAddress(registry, nftCa, tokenId, cfg = {}) {
  return registry.account(
    cfg.tbaImplementation || DEFAULT_TBA.implementation,
    cfg.tbaSalt || DEFAULT_TBA.salt,
    Number(cfg.tbaChainId || DEFAULT_TBA.chainId),
    nftCa,
    tokenId,
  );
}

function uniqByCa(rows) {
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

function knownAssets(data) {
  const erc20 = [];
  const erc721 = [];
  for (const c of AIRDROP_COMMUNITIES) {
    if (c.tokenCa) erc20.push({ ca: c.tokenCa, symbol: c.ticker, name: c.name });
    if (c.nftCa) erc721.push({ ca: c.nftCa, symbol: `${c.ticker} NFT`, name: `${c.name} NFT` });
  }
  erc721.push(SLAB_NFT);
  for (const t of [...(data?.memes || []), ...(data?.stocks || [])]) {
    if (t.ca) erc20.push({ ca: t.ca, symbol: t.name, name: t.name });
  }
  return { erc20: uniqByCa(erc20), erc721: uniqByCa(erc721) };
}

async function mapChunk(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    out.push(...(await Promise.all(slice.map(fn))));
  }
  return out;
}

/**
 * Balances inside TBAs for supported collections, protocol tokens, and the
 * token/stock list. Read on-chain so we do not depend on Blockscout's
 * Cloudflare-gated tokenlist from the browser.
 */
export async function fetchAllTbaInventories(tbas, data) {
  const addrs = [...new Set((tbas || []).filter((a) => a && ethers.isAddress(a)))];
  const empty = Object.fromEntries(addrs.map((a) => [a, []]));
  if (!addrs.length) return empty;

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const { erc20, erc721 } = knownAssets(data);
  const ethUsd = data?.projects?.stonk?.market?.ethPriceUsd || 0;

  const ethBals = await Promise.all(addrs.map((a) => provider.getBalance(a).catch(() => 0n)));
  addrs.forEach((tba, i) => {
    if (ethBals[i] <= 0n) return;
    const amount = Number(ethers.formatEther(ethBals[i]));
    empty[tba].push({
      contract: 'native',
      symbol: 'ETH',
      name: 'Ether',
      amount,
      nft: false,
      usdHint: ethUsd * amount,
    });
  });

  await mapChunk(erc20, 6, async (tok) => {
    const c = new ethers.Contract(tok.ca, ERC20_ABI, provider);
    let decimals = 18;
    try {
      decimals = Number(await c.decimals());
    } catch {
      decimals = 18;
    }
    const bals = await Promise.all(addrs.map((a) => c.balanceOf(a).catch(() => 0n)));
    addrs.forEach((tba, i) => {
      if (bals[i] <= 0n) return;
      empty[tba].push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount: Number(ethers.formatUnits(bals[i], decimals)),
        nft: false,
      });
    });
  });

  await mapChunk(erc721, 4, async (tok) => {
    const c = new ethers.Contract(tok.ca, ERC721_ABI, provider);
    const bals = await Promise.all(addrs.map((a) => c.balanceOf(a).catch(() => 0n)));
    addrs.forEach((tba, i) => {
      const n = Number(bals[i]);
      if (!(n > 0)) return;
      empty[tba].push({
        contract: tok.ca,
        symbol: tok.symbol,
        name: tok.name,
        amount: n,
        nft: true,
      });
    });
  });

  return empty;
}

export function buildPriceIndex(data) {
  const idx = {};
  for (const c of AIRDROP_COMMUNITIES) {
    const p = data?.projects?.[c.key];
    const price = p?.market?.tokenPriceUsd;
    const cas = [c.tokenCa, p?.config?.tokenCa];
    for (const ca of cas) {
      if (ca && price > 0) idx[String(ca).toLowerCase()] = price;
    }
  }
  if (data?.projects?.stonk?.market?.ethPriceUsd) {
    idx.native = data.projects.stonk.market.ethPriceUsd;
  }
  for (const t of [...(data?.memes || []), ...(data?.stocks || [])]) {
    if (!t.ca) continue;
    const derived = t.totalSupply > 0 && t.fdv > 0 ? t.fdv / t.totalSupply : 0;
    const price = t.priceUsd || derived;
    if (price > 0) idx[String(t.ca).toLowerCase()] = price;
  }
  return idx;
}

export function aggregateTbaHoldings(nfts, inventories, priceIndex) {
  const byContract = new Map();
  for (const nft of nfts) {
    const inv = inventories[nft.tba];
    if (inv?.status !== 'ok') continue;
    for (const tok of inv.tokens) {
      const key = tok.contract;
      const prev = byContract.get(key) || {
        contract: key,
        symbol: tok.symbol,
        name: tok.name,
        amount: 0,
        nft: tok.nft,
        sources: 0,
      };
      prev.amount += tok.amount;
      prev.sources += 1;
      byContract.set(key, prev);
    }
  }
  return [...byContract.values()]
    .map((row) => ({
      ...row,
      usd: row.nft ? 0 : (priceIndex[row.contract] || 0) * row.amount,
    }))
    .sort((a, b) => (b.usd - a.usd) || a.symbol.localeCompare(b.symbol));
}
