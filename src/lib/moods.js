/** Moods by Good Vibes Club — mint / Anvil constants from cryochamber.superrare.com. */

export const MOODS_SITE = 'https://cryochamber.superrare.com/#moods-intro';
export const MOODS_OPENSEA = 'https://opensea.io/collection/market-moods-387299773';
export const MOODS_NFT_CA = '0xa6eBbDfcFEaFDC7a5a778D6FE514F45BD0a0133d';
export const MOODS_SUPPLY = 3333;
export const MOODS_UNIT_VALUE = 333333;
export const MOODS_FREEZE_THRESHOLD = 100_000;

export const MOODS_SCHEDULE = {
  chamberOpen: '2026-11-02T21:00:00Z',
  chamberClose: '2026-11-04T14:00:00Z',
  mintOpen: '2026-11-04T14:00:00Z',
  mintClose: '2026-11-06T14:00:00Z',
  anvilOpen: '2026-11-06T15:00:00Z',
  boardOpen: '2026-11-17T17:00:00Z',
};

export const MOODS_ALLOCATION = [
  {
    label: 'Cryo Chamber trade-ins',
    n: 1500,
    who: 'Genesis holders. Freeze a GVC → 3 mint credits, up to 20 GVCs per wallet.',
    how: 'Trade in',
  },
  {
    label: 'StonkBrokers activated wallets',
    n: 590,
    who: 'Activated StonkBrokers wallets. One free Mood each.',
    how: 'Free',
  },
  {
    label: 'Cosmics & 1/1s',
    n: 78,
    who: 'Cosmic and 1/1 holders. 1 free Mood per grail.',
    how: 'Free',
  },
  {
    label: 'Stoke Score',
    n: 100,
    who: 'Top 69 Stoke Scores plus 31 raffled free mints.',
    how: 'Free',
  },
  {
    label: 'Treasury',
    n: 100,
    who: 'Held by the GVC treasury.',
    how: 'Treasury',
  },
  {
    label: 'Team',
    n: 30,
    who: 'Reserved for the GVC team.',
    how: 'Team',
  },
];

export const MOODS_MINT_SUPPLY = MOODS_ALLOCATION.reduce((s, row) => s + row.n, 0);

export function moodsPhase(now = Date.now()) {
  const s = MOODS_SCHEDULE;
  if (now < Date.parse(s.chamberOpen)) return 'soon';
  if (now < Date.parse(s.chamberClose)) return 'chamber';
  if (now < Date.parse(s.mintClose)) return 'mint';
  if (now < Date.parse(s.anvilOpen)) return 'pre-anvil';
  return 'anvil';
}

export function formatEt(iso) {
  const a = new Date(iso);
  const day = a.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).replace(',', '');
  const time = a.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).replace(':00', '');
  return `${day} · ${time} ET`;
}
