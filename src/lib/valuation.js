/**
 * Circulating supply times price is market cap.
 * FDV uses the fixed cap when one is published. With no cap, the two match.
 */
export function tokenValuation(circulating, priceUsd, maxSupply) {
  const px = Number(priceUsd) || 0;
  const circ = Number(circulating) || 0;
  const cap = Number(maxSupply);
  const diluted = cap > 0 ? cap : circ;
  return {
    marketCapUsd: circ * px,
    fdvUsd: diluted * px,
  };
}
