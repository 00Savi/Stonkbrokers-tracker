/**
 * Interns by StonkBrokers: companion collection to StonkBrokers.
 *
 * Paper: https://www.stonkbrokers.cash/docs/interns
 * 8,888 ERC-721C interns, two per broker (V1 Sigma = token id N,
 * V2 Woke = N + 4,444). Activation and mint $STONKBROKER leg are the parent
 * token. CAs live in fetcher.cjs — empty until mint.
 */

export const INTERNS_TOKEN = '$STONKBROKER';
export const INTERNS_DOCS = 'https://www.stonkbrokers.cash/docs/interns';
export const INTERNS_MAX_SUPPLY = 8888;
export const INTERNS_PER_BROKER = 2;
export const INTERNS_ONE_OF_ONES = 56;
export const INTERNS_ROYALTY_BPS = 999;
export const INTERNS_ETH_USD = 20;
export const INTERNS_OPENING_STONK = 999;
export const INTERNS_RAMP_DAYS = 10;
export const INTERNS_RAMP_STEP = 0.1;
export const INTERNS_TAIL_DAYS = 365;
export const INTERNS_TAIL_STEP = 0.01;

/** Job title from the parent broker's Clock In revenue slice. Titles only rise. */
export const INTERNS_TITLES = [
  { id: 'unpaid', name: 'Unpaid Intern', sharePct: 0 },
  { id: 'junior', name: 'Junior Analyst', sharePct: 0.5 },
  { id: 'analyst', name: 'Analyst', sharePct: 1 },
  { id: 'associate', name: 'Associate', sharePct: 2 },
  { id: 'senior', name: 'Senior Associate', sharePct: 2.5 },
];

/** Same Anvil multipliers as StonkBrokers, cheaper $STONKBROKER rungs. */
export const INTERNS_TIERS = [
  { id: 'T0', name: 'Desk', reqTokens: 6666, weight: 100 },
  { id: 'T1', name: 'Junior', reqTokens: 13333, weight: 125 },
  { id: 'T2', name: 'Analyst', reqTokens: 26666, weight: 160 },
  { id: 'T3', name: 'Associate', reqTokens: 46666, weight: 200 },
  { id: 'T4', name: 'Senior', reqTokens: 113333, weight: 333 },
];

export function internClass(tokenId) {
  const n = Number(tokenId);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 4444 ? 'sigma' : 'woke';
}

export function internParentBroker(tokenId) {
  const n = Number(tokenId);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 4444 ? n : n - 4444;
}

/** Published $STONKBROKER mint rungs from the intern paper (plus $20 ETH every mint). */
export const INTERNS_MINT_RUNGS = [
  { day: 0, label: 'First 24h', stonk: 999 },
  { day: 1, label: 'Day 1', stonk: 1098 },
  { day: 2, label: 'Day 2', stonk: 1208 },
  { day: 3, label: 'Day 3', stonk: 1329 },
  { day: 4, label: 'Day 4', stonk: 1462 },
  { day: 5, label: 'Day 5', stonk: 1608 },
  { day: 6, label: 'Day 6', stonk: 1769 },
  { day: 7, label: 'Day 7', stonk: 1946 },
  { day: 8, label: 'Day 8', stonk: 2141 },
  { day: 9, label: 'Day 9', stonk: 2355 },
  { day: 10, label: 'Day 10', stonk: 2591 },
  { day: 11, label: 'Day 11', stonk: 2617 },
  { day: 20, label: 'Day 20', stonk: 2862 },
  { day: 30, label: 'Day 30', stonk: 3161 },
  { day: 60, label: 'Day 60', stonk: 4261 },
  { day: 90, label: 'Day 90', stonk: 5743 },
  { day: 120, label: 'Day 120', stonk: 7741 },
  { day: 180, label: 'Day 180', stonk: 14064 },
  { day: 240, label: 'Day 240', stonk: 25551 },
  { day: 300, label: 'Day 300', stonk: 46418 },
  { day: 365, label: 'Day 365', stonk: 88629 },
  { day: 375, label: 'Day 375+', stonk: 97902 },
];

export function internContractsReady(config = {}) {
  return !!(config.nftCa && config.activationCa);
}

export function internCirculating(ownership = {}) {
  const live = Number(ownership.liveInterns);
  const vault = Number(ownership.ammVaultNfts) || 0;
  if (Number.isFinite(live) && live >= 0) return Math.max(0, live - vault);
  const max = Number(ownership.currentMaxSupply) || INTERNS_MAX_SUPPLY;
  return Math.max(0, max - vault);
}
