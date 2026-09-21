/**
 * Interns by StonkBrokers: companion collection to StonkBrokers.
 *
 * Paper: https://www.stonkbrokers.cash/docs/interns
 * 8,888 ERC-721C interns, two per broker (V1 Sigma = token id N,
 * V2 Divergent = N + 4,444). Activation is in parent $STONKBROKER.
 * Live CAs are in fetcher.cjs PROJECTS.interns.
 */

export const INTERNS_TOKEN = '$STONKBROKER';
export const INTERNS_DOCS = 'https://www.stonkbrokers.cash/docs/interns';
export const INTERNS_MAX_SUPPLY = 8888;
export const INTERNS_PER_BROKER = 2;
export const INTERNS_ONE_OF_ONES = 56;
export const INTERNS_ROYALTY_BPS = 999;

/** Job title from the parent broker's Clock In revenue slice. Titles only rise. */
export const INTERNS_TITLES = [
  { id: 'unpaid', name: 'Unpaid Intern', sharePct: 0 },
  { id: 'junior', name: 'Junior Analyst', sharePct: 0.5 },
  { id: 'analyst', name: 'Analyst', sharePct: 1 },
  { id: 'associate', name: 'Associate', sharePct: 2 },
  { id: 'senior', name: 'Senior Associate', sharePct: 2.5 },
];

/** Live InternActivation.tiers() on 0x668E…4b37. Same weights as brokers. */
export const INTERNS_TIERS = [
  { id: 'T0', name: 'Freshman', reqTokens: 3333, weight: 100 },
  { id: 'T1', name: 'Sophomore', reqTokens: 8333, weight: 125 },
  { id: 'T2', name: 'Junior', reqTokens: 18333, weight: 160 },
  { id: 'T3', name: 'Senior', reqTokens: 33333, weight: 200 },
  { id: 'T4', name: 'Alumnus', reqTokens: 83333, weight: 333 },
];

export function internClass(tokenId) {
  const n = Number(tokenId);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 4444 ? 'sigma' : 'divergent';
}

export function internParentBroker(tokenId) {
  const n = Number(tokenId);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 4444 ? n : n - 4444;
}

const BROKERS = INTERNS_MAX_SUPPLY / INTERNS_PER_BROKER;

/** Sigma #N and Divergent #N+4444 for a parent broker. */
export function internIdsForBroker(brokerId) {
  const n = Number(brokerId);
  if (!Number.isInteger(n) || n < 1 || n > BROKERS) return [];
  return [
    { id: n, klass: 'sigma', label: 'V1 Sigma' },
    { id: n + BROKERS, klass: 'divergent', label: 'V2 Divergent' },
  ];
}

export function internContractsReady(config = {}) {
  return !!(config.nftCa && config.activationCa);
}

/** Intern Clock In / Exchange are a later desk. Collection + activation can be live without them. */
export function internDesksReady(config = {}) {
  return !!(config.clockInCa || config.ammCa || config.internExchangeCa);
}

export function internCirculating(ownership = {}) {
  const live = Number(ownership.liveInterns);
  const vault = Number(ownership.ammVaultNfts) || 0;
  if (Number.isFinite(live) && live >= 0) return Math.max(0, live - vault);
  const max = Number(ownership.currentMaxSupply) || INTERNS_MAX_SUPPLY;
  return Math.max(0, max - vault);
}
