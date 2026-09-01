// The URL vocabulary, in one place.
//
// URLs and internal keys are deliberately allowed to disagree. The data keys
// (`stonk`, `historical`) are what data.json and gg-index have always called
// these things and renaming them would touch every view and the fetcher; the
// URLs are what a person types and shares, so they get to read the way the
// project is actually spoken about -- /stonkbrokers/yield, not /stonk/historical.
//
// Everything that translates between the two lives here so the two vocabularies
// can never drift apart across call sites.

/** URL slug -> the key used inside `data.projects`. */
export const PROJECT_BY_SLUG = {
  stonkbrokers: 'stonk',
  mancer: 'mancer',
  tickeryard: 'tickeryard',
  cardwall: 'cardwall',
  index: 'index',
  rhmachines: 'printer',
  oakmont: 'oakmont',
  bonus: 'bonus',
};

export const SLUG_BY_PROJECT = Object.fromEntries(
  Object.entries(PROJECT_BY_SLUG).map(([slug, key]) => [key, slug])
);

/** URL slug -> the `activeTab` id the detail views already switch on. */
export const TAB_BY_SLUG = {
  roi: 'roi',
  yield: 'historical',
  revenue: 'revenue',
  burn: 'burn',
  activation: 'activation',
  ownership: 'ownership',
};

export const SLUG_BY_TAB = Object.fromEntries(
  Object.entries(TAB_BY_SLUG).map(([slug, tab]) => [tab, slug])
);

/** Ordered for the tab bar. The order is the reading order of the story:
 *  what you'd earn, what it actually paid, where the money came from,
 *  what got destroyed, then the two ownership-side views. */
export const TABS = [
  { slug: 'roi', label: 'ROI' },
  { slug: 'yield', label: 'Yield' },
  { slug: 'revenue', label: 'Revenue' },
  { slug: 'burn', label: 'Burn' },
  { slug: 'activation', label: 'Activation' },
  { slug: 'ownership', label: 'Ownership' },
];

export const PROJECTS = [
  { slug: 'stonkbrokers', key: 'stonk', name: 'StonkBrokers', ticker: 'STONK' },
  { slug: 'mancer', key: 'mancer', name: 'Mancer', ticker: 'MANCER' },
  { slug: 'tickeryard', key: 'tickeryard', name: 'TickerYard', ticker: 'YARD' },
  { slug: 'cardwall', key: 'cardwall', name: 'The Card Wall', ticker: 'WALL', beta: true },
  { slug: 'index', key: 'index', name: 'The Index', ticker: 'INDEX', kind: 'cashflow', logo: 'Index.png', beta: true },
  { slug: 'rhmachines', key: 'printer', name: 'RH Machines', ticker: 'PRINTER', kind: 'machines', logo: 'Printer.png', beta: true },
  { slug: 'oakmont', key: 'oakmont', name: 'Oakmont Vault', ticker: 'STRIKE', kind: 'vault', logo: 'Oakmont.png', beta: true },
  {
    slug: 'bonus',
    key: 'bonus',
    name: '$Bonus',
    ticker: 'BONUS',
    kind: 'token',
    logo: 'Bonus.png',
    live: false,
  },
];

/** Flip `live` on the bonus project when the token launches. */
export const BONUS_LIVE = PROJECTS.some((p) => p.key === 'bonus' && p.live);

/** NFT yield projects — rankings, ecosystem, and the ROI tab bar. */
export const NFT_PROJECTS = PROJECTS.filter((p) => !p.kind || p.kind === 'machines');

/** Everything shown in the ranked table: NFT units plus cash-flow tokens/vaults. */
export const RANKING_PROJECTS = PROJECTS.filter((p) => p.kind !== 'token');

export const projectPath = (key, tab = 'roi') => {
  const meta = PROJECTS.find((p) => p.key === key);
  if (meta?.kind === 'token') return `/${meta.slug}`;
  return `/${SLUG_BY_PROJECT[key] ?? key}/${SLUG_BY_TAB[tab] ?? tab}`;
};

export const DEFAULT_TAB = 'roi';
