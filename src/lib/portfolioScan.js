import { PROJECTS, isProjectLive } from './routes';
import { NIGHTSHADES_FACTION_META, factionLabel } from './nightshades';

export function portfolioProjectLabel(key, ticker) {
  const k = String(key || '');
  if (k.startsWith('nightshades:')) return `Nightshades ${factionLabel(k.split(':')[1])}`;
  return PROJECTS.find((p) => p.key === key)?.name || ticker;
}

/**
 * NFT collections a portfolio scan should walk: every live nav project,
 * including the four Nightshades factions. Hidden copycats stay out.
 */
export function navNftScanTargets(data) {
  const targets = [];
  for (const [pKey, pData] of Object.entries(data?.projects || {})) {
    const meta = PROJECTS.find((p) => p.key === pKey);
    if (meta && !isProjectLive(meta)) continue;
    if (pKey === 'nightshades') {
      for (const f of NIGHTSHADES_FACTION_META) {
        const slice = pData.factions?.[f.id];
        if (!slice?.config?.nftCa) continue;
        targets.push({
          pKey: `nightshades:${f.id}`,
          pData: {
            ...slice,
            config: {
              ...slice.config,
              ticker: slice.config.ticker || f.ticker,
              logo: slice.config.logo || pData.config?.logo,
            },
            market: {
              ...slice.market,
              ethPriceUsd: slice.market?.ethPriceUsd || pData.market?.ethPriceUsd,
            },
          },
        });
      }
      continue;
    }
    if (!pData.config?.nftCa) continue;
    targets.push({ pKey, pData });
  }
  return targets;
}
