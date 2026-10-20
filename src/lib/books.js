/** Which revenue stream is cash the protocol kept, cash already paid to seats, or cash still in the pot. */

const FLOAT = new Set(['stonk', 'interns']);
const PAID = new Set([
  'mancer',
  'tickeryard',
  'cardwall',
  'nightshades',
  'ghosts',
  'zombies',
  'knights',
  'watchers',
]);
/** DEX RewardPaid is inside Mancer's seat yield, same cash as the AMM vault. */
const PAID_DEX = new Set(['mancer']);

const BY_TICKER = {
  STONK: 'stonk',
  STONKBROKER: 'interns',
  INTERN: 'interns',
  INTERNS: 'interns',
  MANCER: 'mancer',
  YARD: 'tickeryard',
  WALL: 'cardwall',
  CARD: 'cardwall',
  CARDWALL: 'cardwall',
  GHOSTS: 'ghosts',
  ZOMBIES: 'zombies',
  KNIGHTS: 'knights',
  WATCHERS: 'watchers',
  NIGHT: 'nightshades',
  NIGHTSHADES: 'nightshades',
};

export function bookSlugOf(project) {
  if (project?.bookSlug) return project.bookSlug;
  const faction = project?.config?.faction;
  if (faction && (PAID.has(faction) || FLOAT.has(faction))) return faction;
  const ticker = String(project?.config?.ticker || '').toUpperCase();
  return BY_TICKER[ticker] || null;
}

/** 'paid' | 'float' | null (null means the stream is a fee the protocol kept). */
export function yieldBook(project) {
  const slug = bookSlugOf(project);
  if (FLOAT.has(slug)) return 'float';
  if (PAID.has(slug)) return 'paid';
  return null;
}

function ink(arr) {
  return (arr || []).some((v) => Number(v) > 0);
}

/**
 * Streams that are holder cash, not fees kept.
 * Prefer dedicated paid/float history once the indexer writes it.
 * Until then, the AMM column (and Mancer's DEX column) is that cash.
 */
export function holderStreams(project) {
  const rev = project?.revenue || {};
  const paidInk = ink(rev.historyPaid);
  const floatInk = ink(rev.historyFloat);
  if (paidInk || floatInk) {
    return { paid: paidInk ? ['paid'] : [], float: floatInk ? ['float'] : [] };
  }
  const book = yieldBook(project);
  const slug = bookSlugOf(project);
  if (book === 'float') return { paid: [], float: ['amm'] };
  if (book === 'paid') return { paid: PAID_DEX.has(slug) ? ['amm', 'dex'] : ['amm'], float: [] };
  return { paid: [], float: [] };
}
