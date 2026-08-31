import { ethers } from 'ethers';
import { DEAD_ADDRESS, ROBINHOOD_RPC } from './bonusTokenomics';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export function readViteEnv(key) {
  try {
    const fromMeta = import.meta.env?.[key];
    if (fromMeta) return fromMeta;
  } catch {
    /* ignore */
  }
  if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key];
  return undefined;
}

export function bonusTokenAddress(data) {
  const fromData =
    data?.projects?.bonus?.config?.tokenCa || data?.projects?.bonus?.config?.token;
  if (fromData && ethers.isAddress(fromData)) return fromData;
  const fromEnv = readViteEnv('VITE_BONUS_TOKEN');
  if (fromEnv && ethers.isAddress(fromEnv)) return fromEnv;
  return null;
}

export async function fetchBonusBurned(tokenCa, signal) {
  if (!tokenCa || !ethers.isAddress(tokenCa)) return null;
  if (signal?.aborted) return null;

  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC);
  const token = new ethers.Contract(tokenCa, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(DEAD_ADDRESS),
    token.decimals(),
  ]);
  if (signal?.aborted) return null;
  return Number(ethers.formatUnits(raw, decimals));
}