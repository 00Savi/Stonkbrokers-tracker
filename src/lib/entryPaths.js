/**
 * Ways into a StonkBroker, priced the same way.
 *
 * OpenSea: that NFT's own listing. Anvil: the specific-buy quote, which is the
 * same token amount for every id in the vault, so a richer wallet is a cheaper
 * entry. Purchase cost is the path cost minus the wallet. Lower is the better
 * way in. A negative number means the wallet is worth more than the path costs.
 */
export function bestEntries({ listings, vaultRows, snipeUsd, limit = 8 } = {}) {
  const paths = [];
  for (const row of listings || []) {
    const cost = Number(row.floorUsd) || Number(row.usd) || 0;
    const wallet = Number(row.walletUsd) || 0;
    if (!(cost > 0)) continue;
    paths.push({
      kind: 'opensea',
      id: Number(row.id),
      costUsd: cost,
      walletUsd: wallet,
      purchaseUsd: cost - wallet,
      ask: Number(row.floorAsk ?? row.ask) || 0,
      symbol: row.floorSymbol || row.symbol || '',
      interns: row.interns || [],
    });
  }

  const snipe = Number(snipeUsd) || 0;
  if (snipe > 0) {
    const richest = [...(vaultRows || [])]
      .sort((a, b) => (Number(b.usd) || 0) - (Number(a.usd) || 0))
      .slice(0, 5);
    for (const row of richest) {
      const wallet = Number(row.usd) || 0;
      paths.push({
        kind: 'anvil',
        id: Number(row.tokenId),
        costUsd: snipe,
        walletUsd: wallet,
        purchaseUsd: snipe - wallet,
        ask: 0,
        symbol: '',
        interns: row.interns || [],
      });
    }
  }

  paths.sort((a, b) => a.purchaseUsd - b.purchaseUsd || a.costUsd - b.costUsd || a.id - b.id);
  const shown = paths.slice(0, limit);
  for (const kind of ['opensea', 'anvil']) {
    if (shown.some((path) => path.kind === kind)) continue;
    const hit = paths.find((path) => path.kind === kind);
    if (hit) shown.push(hit);
  }
  shown.sort((a, b) => a.purchaseUsd - b.purchaseUsd || a.costUsd - b.costUsd || a.id - b.id);
  return shown;
}
