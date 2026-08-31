import { ethers } from 'ethers';
import { bonusTokenAddress, readViteEnv } from './bonusBurn';
import { AIRDROP_COMMUNITIES, DEFAULT_TBA, resolveCommunityNftCa } from './airdropCommunities';
import {
  ETH_FEE_PER_COLLECTION,
  TBA_BATCH_SIZE,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_RPC,
} from './bonusTokenomics';

export const BONUS_AIRDROP_ENGINE_ABI = [
  'function createCampaign(address tokenToDrop, uint256 totalExpectedTBAs, uint256 amountPerTBA, uint256 projectCount) payable returns (uint256)',
  'function executeBatch(uint256 campaignId, address[] tbaRecipients)',
  'function cancelCampaign(uint256 campaignId)',
  'function campaigns(uint256) view returns (address creator, address tokenToDrop, uint256 totalExpectedTBAs, uint256 amountPerTBA, uint256 tbasProcessed, bool isActive)',
  'event CampaignCreated(uint256 indexed campaignId, address indexed creator, address tokenToDrop, uint256 totalExpectedTBAs, uint256 amountPerTBA, uint256 projectCount)',
  'event BatchExecuted(uint256 indexed campaignId, uint256 batchSize, uint256 totalProcessed)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const REGISTRY_ABI = [
  'function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId) view returns (address)',
];

const CAMPAIGN_STORAGE_KEY = 'bonus-airdrop-campaign';
const ACCOUNT_CALL_CHUNK = 80;

export function engineAddress() {
  const addr = readViteEnv('VITE_BONUS_AIRDROP_ENGINE');
  return addr && ethers.isAddress(addr) ? addr : null;
}

function uniqueTbas(tbas) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(tbas) ? tbas : []) {
    const addr = typeof raw === 'string' ? raw : raw?.address;
    if (!addr || !ethers.isAddress(addr) || addr === ethers.ZeroAddress) continue;
    const key = ethers.getAddress(addr);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function sliceTbaBatches(tbas, size = TBA_BATCH_SIZE) {
  const list = uniqueTbas(tbas);
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

export async function loadTbaTargets(communityIds, data) {
  const ids = Array.isArray(communityIds) ? communityIds : [];
  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const all = [];

  for (const id of ids) {
    const community = AIRDROP_COMMUNITIES.find((c) => c.id === id);
    if (!community) continue;

    const nftCa = resolveCommunityNftCa(community, data);
    if (!nftCa || !ethers.isAddress(nftCa)) {
      throw new Error(
        `${community.name} NFT contract is not set. Add nftCa in airdropCommunities.js or snapshot config.`
      );
    }

    const cfg = data?.projects?.[community.key]?.config || {};
    const registryAddr = cfg.tbaRegistry || DEFAULT_TBA.registry;
    const implementation = cfg.tbaImplementation || DEFAULT_TBA.implementation;
    const salt = cfg.tbaSalt || DEFAULT_TBA.salt;
    const chainId = Number(cfg.tbaChainId || DEFAULT_TBA.chainId);
    const first = Number(community.firstTokenId || 1);
    const count = Number(community.mintedSupply || 0);
    if (count <= 0) {
      throw new Error(`${community.name} mintedSupply is missing.`);
    }

    const registry = new ethers.Contract(registryAddr, REGISTRY_ABI, provider);
    const tokenIds = Array.from({ length: count }, (_, i) => first + i);

    for (let i = 0; i < tokenIds.length; i += ACCOUNT_CALL_CHUNK) {
      const slice = tokenIds.slice(i, i + ACCOUNT_CALL_CHUNK);
      const addresses = await Promise.all(
        slice.map((tokenId) =>
          registry.account(implementation, salt, chainId, nftCa, tokenId)
        )
      );
      all.push(...addresses);
    }
  }

  return uniqueTbas(all);
}

export function readStoredCampaign() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.campaignId == null || parsed.campaignId === '') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredCampaign(payload) {
  localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredCampaign() {
  localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
}

export async function getSigner() {
  const injected = globalThis.ethereum;
  if (!injected) {
    throw new Error('No wallet found. Connect a browser wallet on Robinhood Chain.');
  }
  const provider = new ethers.BrowserProvider(injected);
  await provider.send('eth_requestAccounts', []);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(ROBINHOOD_CHAIN_ID)) {
    try {
      await injected.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1237' }],
      });
    } catch {
      throw new Error('Switch your wallet to Robinhood Chain (chain id 4663).');
    }
  }
  return new ethers.BrowserProvider(injected).getSigner();
}

async function approveExact(tokenAddress, humanAmount) {
  const engine = engineAddress();
  if (!engine) throw new Error('Set VITE_BONUS_AIRDROP_ENGINE to the deployed registry.');
  if (!ethers.isAddress(tokenAddress)) throw new Error('Token address is not valid.');

  const signer = await getSigner();
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const decimals = await token.decimals();
  const amount = ethers.parseUnits(String(humanAmount), decimals);
  const current = await token.allowance(owner, engine);
  if (current >= amount) return null;
  const tx = await token.approve(engine, amount);
  return tx.wait();
}

export async function handleApproveBonus(burnHumanAmount, data) {
  const bonusCa = bonusTokenAddress(data);
  if (!bonusCa) throw new Error('$BONUS token address is not configured yet.');
  return approveExact(bonusCa, burnHumanAmount);
}

export async function handleApproveDropToken(tokenAddress, totalHumanAmount) {
  return approveExact(tokenAddress, totalHumanAmount);
}

function parseCampaignId(receipt, contract) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === 'CampaignCreated') return parsed.args.campaignId;
    } catch {
      /* skip */
    }
  }
  throw new Error('Campaign created but campaignId was not in the receipt logs.');
}

export async function handleCreateCampaign(
  tokenAddress,
  totalTbas,
  amountPerTba,
  projectCount
) {
  const engine = engineAddress();
  if (!engine) throw new Error('Set VITE_BONUS_AIRDROP_ENGINE to the deployed registry.');
  if (!ethers.isAddress(tokenAddress)) throw new Error('Drop token address is not valid.');
  if (!projectCount || Number(projectCount) < 1) {
    throw new Error('Select at least one community.');
  }

  const signer = await getSigner();
  const drop = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const decimals = await drop.decimals();
  const amountWei = ethers.parseUnits(String(amountPerTba), decimals);
  const value = ethers.parseEther(String(ETH_FEE_PER_COLLECTION)) * BigInt(projectCount);

  const contract = new ethers.Contract(engine, BONUS_AIRDROP_ENGINE_ABI, signer);
  const tx = await contract.createCampaign(
    tokenAddress,
    totalTbas,
    amountWei,
    projectCount,
    { value }
  );
  const receipt = await tx.wait();
  return parseCampaignId(receipt, contract);
}

export async function handleExecuteBatch(campaignId, tbaBatchArray) {
  const engine = engineAddress();
  if (!engine) throw new Error('Set VITE_BONUS_AIRDROP_ENGINE to the deployed registry.');
  if (campaignId == null || campaignId === '') throw new Error('No campaign id.');

  const batch = uniqueTbas(tbaBatchArray);
  if (!batch.length) throw new Error('TBA batch is empty.');
  if (batch.length > TBA_BATCH_SIZE) {
    throw new Error(`Batch exceeds ${TBA_BATCH_SIZE} TBAs.`);
  }

  const signer = await getSigner();
  const contract = new ethers.Contract(engine, BONUS_AIRDROP_ENGINE_ABI, signer);
  const tx = await contract.executeBatch(campaignId, batch);
  return tx.wait();
}