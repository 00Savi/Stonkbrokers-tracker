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
export const INTERNS_STONK_STEP = 999;
export const INTERNS_RAMP_DAYS = 10;
export const INTERNS_STONK_CAP = 9999;

/** $STONKBROKER mint leg for that calendar day after the 24h opener. Caps at 9,999. */
export function internMintStonk(day) {
  const d = Math.max(0, Math.floor(Number(day) || 0));
  return Math.min(INTERNS_OPENING_STONK + INTERNS_STONK_STEP * d, INTERNS_STONK_CAP);
}

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

/** Published $STONKBROKER mint rungs: +999/day after the opener, hard cap 9,999 from day 10. */
export const INTERNS_MINT_RUNGS = [
  { day: 0, label: 'First 24h', stonk: internMintStonk(0) },
  ...Array.from({ length: INTERNS_RAMP_DAYS }, (_, i) => {
    const day = i + 1;
    return { day, label: `Day ${day}`, stonk: internMintStonk(day), cap: day === INTERNS_RAMP_DAYS };
  }),
  { day: INTERNS_RAMP_DAYS + 1, label: 'After', stonk: INTERNS_STONK_CAP, after: true },
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
