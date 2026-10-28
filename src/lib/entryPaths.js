/**
 * Ways into a StonkBroker, priced the same way.
 *
 * OpenSea: that NFT's own listing. The ask is what the buyer pays. OpenSea's
 * fee and the creator fees are already inside it, so the lines add back up to
 * the ask. Anvil: the specific-buy quote, the same token amount for every id,
 * plus the ETH fee on top. A richer wallet is a cheaper snipe.
 *
 * Net cost is the total paid minus the wallet that comes with the NFT. Lower
 * is the better way in. A negative number means the wallet is worth more than
 * the path costs. The buyer still pays the total.
 */
export function feePercentLabel(bps) {
  const pct = (Number(bps) || 0) / 100;
  if (!Number.isFinite(pct) || pct <= 0) return '';
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}%`;
}

/** Split a buyer-total ask into the pre-fee floor and each fee inside it. */
export function askBreakdown(totalUsd, feeParts) {
  const total = Number(totalUsd) || 0;
  const fees = (feeParts || []).map((part) => {
    const bps = Number(part.bps) || 0;
    return {
      label: part.label || 'Fee',
      bps,
      usd: total * bps / 10000,
    };
  }).filter((part) => part.bps > 0 && part.usd > 0);
  const feeUsd = fees.reduce((sum, part) => sum + part.usd, 0);
  const lines = [
    { label: 'Floor', usd: total - feeUsd },
    ...fees.map((part) => ({
      label: `${part.label} ${feePercentLabel(part.bps)}`.trim(),
      usd: part.usd,
    })),
  ];
  return { lines, totalUsd: total, feeUsd, itemUsd: total - feeUsd };
}

export function anvilBreakdown(snipe) {
  if (!snipe || !(snipe.usd > 0)) return null;
  const tokenUsd = Number(snipe.tokenLegUsd) || 0;
  const feeUsd = Number(snipe.ethLegUsd) || 0;
  const tokens = Math.round(Number(snipe.tokens) || 0).toLocaleString('en-US');
  const ticker = snipe.ticker || 'tokens';
  const fee = feePercentLabel(snipe.feeBps);
  return {
    lines: [
      { label: `${tokens} ${ticker}`, usd: tokenUsd },
      { label: fee ? `Fee ${fee}` : 'Fee', usd: feeUsd },
    ],
    totalUsd: Number(snipe.usd) || 0,
  };
}

export function bestEntries({ listings, vaultRows, snipe, snipeUsd, feeParts, limit = 120 } = {}) {
  const paths = [];
  for (const row of listings || []) {
    const cost = Number(row.floorUsd) || Number(row.usd) || 0;
    const wallet = Number(row.walletUsd) || 0;
    if (!(cost > 0)) continue;
    const quote = askBreakdown(cost, feeParts);
    paths.push({
      kind: 'opensea',
      id: Number(row.id),
      costUsd: quote.totalUsd,
      walletUsd: wallet,
      purchaseUsd: quote.totalUsd - wallet,
      lines: quote.lines,
      ask: Number(row.floorAsk ?? row.ask) || 0,
      symbol: row.floorSymbol || row.symbol || '',
      imageUrl: row.imageUrl || '',
      interns: row.interns || [],
      holdings: row.wallet || row.holdings || [],
    });
  }

  const quote = anvilBreakdown(snipe) || (Number(snipeUsd) > 0
    ? { lines: [{ label: 'Anvil', usd: Number(snipeUsd) }], totalUsd: Number(snipeUsd) }
    : null);
  if (quote) {
    const richest = [...(vaultRows || [])]
      .sort((a, b) => (Number(b.usd) || 0) - (Number(a.usd) || 0))
      .slice(0, 8);
    for (const row of richest) {
      const wallet = Number(row.usd) || 0;
      paths.push({
        kind: 'anvil',
        id: Number(row.tokenId),
        costUsd: quote.totalUsd,
        walletUsd: wallet,
        purchaseUsd: quote.totalUsd - wallet,
        lines: quote.lines,
        ask: 0,
        symbol: '',
        imageUrl: row.imageUrl || '',
        interns: row.interns || [],
        holdings: row.holdings || row.wallet || [],
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
