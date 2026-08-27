// Live market prices in the browser.
//
// data.json is regenerated hourly, because that is the cadence its slowest and
// most expensive source can afford. Prices do not move on that schedule. The
// header was showing $0.01717 for STONK against a real 0.01938, and a 5.039 ETH
// floor against 5.50 — not a bug in the numbers, just an hour of drift in
// figures that change by the minute.
//
// Both sources are free and send `access-control-allow-origin: *`, so there is
// no reason for the page to wait on the hourly job for them.
//
// The floor is derived, not fetched: `unitValue * tokenPriceUsd * 1.10 /
// ethPriceUsd`. Both inputs were stale, which is why it was wrong too, and why
// recomputing it here rather than carrying it over is the whole point.

const COINBASE = 'https://api.exchange.coinbase.com/products/ETH-USD/ticker';
const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens';

async function ethPriceUsd(signal) {
  const res = await fetch(COINBASE, { signal });
  if (!res.ok) throw new Error(`coinbase -> ${res.status}`);
  const j = await res.json();
  const p = parseFloat(j?.price);
  if (!(p > 0)) throw new Error('coinbase returned no price');
  return p;
}

/**
 * Pick the pair a price should come from.
 *
 * Mirrors fetcher.cjs deliberately, including the ordering. Sorting by trade
 * COUNT before liquidity is not an arbitrary preference — it steps around pools
 * seeded with fake liquidity and no real trading, which would otherwise win on
 * `liquidity.usd` and quote a fictional price. If this diverges from the
 * fetcher, the header and the rest of the page start disagreeing.
 */
function bestPair(pairs, tokenCa) {
  const onChain = pairs.filter(
    (p) => p.chainId === 'robinhood' || (p.url && p.url.includes('robinhood')),
  );
  if (!onChain.length) return null;

  return onChain.sort((a, b) => {
    const txsA = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0);
    const txsB = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0);
    if (txsB !== txsA) return txsB - txsA;

    const vol = (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
    if (vol !== 0) return vol;

    return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
  })[0];
}

async function tokenPriceUsd(tokenCa, signal) {
  const res = await fetch(`${DEXSCREENER}/${tokenCa}`, { signal });
  if (!res.ok) throw new Error(`dexscreener -> ${res.status}`);
  const j = await res.json();

  const best = bestPair(j?.pairs || [], tokenCa);
  if (!best) return null;

  let price = parseFloat(best.priceUsd || 0);

  // When our token is the pair's QUOTE rather than its base, `priceUsd`
  // describes the other side of the pair. Inverting by priceNative recovers
  // ours; without this the header would confidently show a completely
  // unrelated token's price.
  if (best.quoteToken?.address?.toLowerCase() === tokenCa.toLowerCase()) {
    const native = parseFloat(best.priceNative || 1);
    if (native > 0) price = price / native;
  }

  return price > 0 ? price : null;
}

/**
 * Current ETH and per-project token prices.
 *
 * `projects` comes from gg-index's catalog, which is where the token addresses
 * live — data.json's `config` carries the NFT address but not the token's.
 */
export async function loadPrices(projects, signal) {
  const eth = await ethPriceUsd(signal);

  const entries = await Promise.allSettled(
    projects.map(async (p) => {
      const token = p.contracts?.find((c) => c.kind === 'token')?.address;
      if (!token) return null;
      const price = await tokenPriceUsd(token, signal);
      return price ? [p.slug, price] : null;
    }),
  );

  const tokens = {};
  for (const e of entries) {
    if (e.status === 'fulfilled' && e.value) tokens[e.value[0]] = e.value[1];
    else if (e.status === 'rejected') console.warn('price fetch failed', e.reason);
  }

  return { ethPriceUsd: eth, tokens };
}

/**
 * Patch live prices onto a payload, recomputing the derived floor.
 *
 * Only `market` is touched. Revenue and yield totals are left as the fetcher
 * computed them: they are sums over a seven-day window priced at the time each
 * event was read, so re-pricing them against a spot price would not make them
 * fresher, it would make them wrong in a new way.
 */
export function applyPrices(base, prices) {
  if (!base?.projects || !prices?.ethPriceUsd) return base;

  const projects = { ...base.projects };
  for (const [slug, p] of Object.entries(projects)) {
    const tokenPrice = prices.tokens[slug] ?? p.market?.tokenPriceUsd;
    if (!(tokenPrice > 0)) continue;

    const unitValue = p.config?.unitValue;
    const market = {
      ...p.market,
      ethPriceUsd: prices.ethPriceUsd,
      tokenPriceUsd: tokenPrice,
    };

    if (unitValue > 0) {
      market.nftFloorEth = +((unitValue * tokenPrice * 1.1) / prices.ethPriceUsd).toFixed(3);
    }

    projects[slug] = { ...p, market };
  }

  return { ...base, projects };
}
