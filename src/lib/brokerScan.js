import { ethers } from 'ethers';
import { ROBINHOOD_RPC } from './bonusTokenomics';
import { internIdsForBroker, internParentBroker } from './interns';
import { fetchNftImage } from './portfolioHistory';
import {
  buildPriceIndex,
  fetchAllTbaInventories,
  resolveTbaAddress,
  tbaRegistry,
} from './tba';

export const BROKER_ID_MIN = 1;
export const BROKER_ID_MAX = 4444;

const ERC721_ABI = ['function ownerOf(uint256 tokenId) view returns (address)'];
const ACTIVATION_ABI = [
  'function activations(uint256) view returns (address owner, uint256 timestamp, uint256 amount)',
];

export function parseBrokerId(raw) {
  const s = String(raw || '').trim().replace(/^#/, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return null;
  if (n <= BROKER_ID_MAX) return n;
  if (n <= 8888) return internParentBroker(n);
  return null;
}

async function ownerOf(nft, id) {
  try {
    return await nft.ownerOf(id);
  } catch {
    return null;
  }
}

function snapActivation(map, id) {
  if (!map) return null;
  return map[id] || map[String(id)] || null;
}

async function liveActivation(ca, id, provider) {
  if (!ca || !ethers.isAddress(ca)) return null;
  try {
    const c = new ethers.Contract(ca, ACTIVATION_ABI, provider);
    const row = await c.activations(id);
    const owner = row?.owner || row?.[0];
    if (!owner || owner === ethers.ZeroAddress) return null;
    return {
      owner,
      ts: Number(row?.timestamp || row?.[1] || 0),
      tokens: Number(row?.amount ?? row?.[2] ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Live look-up: broker owner, TBA inventory, and whether each intern
 * exists / is still dormant in the parent wallet / has been released.
 */
export async function scanBroker(rawId, data) {
  const brokerId = parseBrokerId(rawId);
  if (!brokerId) throw new Error('Enter a broker ID from 1 to 4444.');

  const stonk = data?.projects?.stonk;
  const intern = data?.projects?.interns;
  const nftCa = stonk?.config?.nftCa;
  if (!nftCa || !ethers.isAddress(nftCa)) throw new Error('StonkBrokers collection is not loaded.');

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const brokerNft = new ethers.Contract(nftCa, ERC721_ABI, provider);
  const owner = await ownerOf(brokerNft, brokerId);
  if (!owner) throw new Error(`Broker #${brokerId} is not minted.`);

  const cfg = stonk.config || {};
  const registry = tbaRegistry(provider, { tbaRegistry: cfg.tbaRegistry });
  const tba = await resolveTbaAddress(registry, nftCa, brokerId, {
    tbaImplementation: cfg.tbaImplementation,
    tbaChainId: cfg.tbaChainId,
    tbaSalt: cfg.tbaSalt,
  });

  const inventories = await fetchAllTbaInventories([tba], data);
  const priceIndex = buildPriceIndex(data);
  const wallet = (inventories[tba] || [])
    .map((tok) => ({
      ...tok,
      usd: tok.nft ? 0 : (tok.usdHint || (priceIndex[tok.contract] || 0) * tok.amount),
    }))
    .sort((a, b) => (b.usd - a.usd) || a.symbol.localeCompare(b.symbol));

  const internCa = intern?.config?.nftCa;
  const internNft = internCa && ethers.isAddress(internCa)
    ? new ethers.Contract(internCa, ERC721_ABI, provider)
    : null;

  const internRows = [];
  for (const row of internIdsForBroker(brokerId)) {
    const internOwner = internNft ? await ownerOf(internNft, row.id) : null;
    const minted = !!internOwner;
    const dormant = minted && internOwner.toLowerCase() === tba.toLowerCase();
    const snap = snapActivation(intern?.activation?.activeTokenTiers, row.id);
    internRows.push({
      ...row,
      minted,
      owner: internOwner,
      dormant,
      released: minted && !dormant,
      active: !!snap,
      imageUrl: null,
    });
  }

  const [imageUrl, ...internImages] = await Promise.all([
    fetchNftImage(nftCa, brokerId),
    ...internRows.map((row) => (
      internCa && row.minted ? fetchNftImage(internCa, row.id) : Promise.resolve(null)
    )),
  ]);
  internRows.forEach((row, i) => {
    row.imageUrl = internImages[i];
  });

  const snap = snapActivation(stonk?.activation?.activeTokenTiers, brokerId);
  const live = snap ? null : await liveActivation(cfg.activationCa, brokerId, provider);

  return {
    brokerId,
    owner,
    tba,
    nftCa,
    internCa: internCa || null,
    imageUrl,
    activation: {
      active: !!(snap || live),
      tier: snap?.t || snap?.tier || null,
      ts: Number(snap?.ts || live?.ts || 0),
    },
    wallet,
    interns: internRows,
  };
}
