/** Nightshades is one dashboard project and four gg-index slugs. */

export const NIGHTSHADES_FACTIONS = ['ghosts', 'zombies', 'knights', 'watchers'];

export const NIGHTSHADES_FACTION_META = [
  { id: 'ghosts', label: 'Ghosts', ticker: 'GHOSTS' },
  { id: 'zombies', label: 'Zombies', ticker: 'ZOMBIES' },
  { id: 'knights', label: 'Knights', ticker: 'KNIGHTS' },
  { id: 'watchers', label: 'Watchers', ticker: 'WATCHERS' },
];

export function isNightshadesFaction(slug) {
  return NIGHTSHADES_FACTIONS.includes(slug);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avgPositive(vals) {
  const xs = vals.map(num).filter((n) => n > 0);
  if (!xs.length) return 0;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

/** Sum holder counts across factions for the All rollup. */
export function rollupNightshadesOwnership(factions = {}) {
  const list = NIGHTSHADES_FACTIONS.map((k) => factions[k]?.ownership || {});
  const nftHolders = list.reduce((s, o) => s + num(o.nftHolders), 0);
  const tokenHolders = list.reduce(
    (s, o) => s + num(o.tokenHolders || o.stonkHolders || o.erc20Holders),
    0,
  );
  const ammVaultNfts = list.reduce((s, o) => s + num(o.ammVaultNfts), 0);
  const burntNfts = list.reduce((s, o) => s + num(o.burntNfts), 0);
  const currentMaxSupply = list.reduce((s, o) => s + (num(o.currentMaxSupply) || 3000), 0) || 12000;
  const circulatingNftSupply = Math.max(0, currentMaxSupply - ammVaultNfts);
  const ownershipRatio = circulatingNftSupply > 0
    ? Math.min(100, (nftHolders / circulatingNftSupply) * 100)
    : 0;

  return {
    ammVaultNfts,
    burntNfts,
    currentMaxSupply,
    circulatingNftSupply,
    nftHolders,
    stonkHolders: tokenHolders,
    tokenHolders,
    erc20Holders: tokenHolders,
    ownershipRatio: +ownershipRatio.toFixed(2),
  };
}

/** Average live prices / floors so the All Anvil charts still have a market. */
export function rollupNightshadesMarket(factions = {}, ethPriceUsd) {
  const list = NIGHTSHADES_FACTIONS.map((k) => factions[k]?.market || {});
  const tokenPriceUsd = avgPositive(list.map((m) => m.tokenPriceUsd));
  const nftFloorEth = avgPositive(list.map((m) => m.nftFloorEth));
  const eth = ethPriceUsd || avgPositive(list.map((m) => m.ethPriceUsd));
  return {
    ethPriceUsd: eth || 0,
    tokenPriceUsd,
    nftFloorEth: nftFloorEth ? +nftFloorEth.toFixed(3) : 0,
  };
}
