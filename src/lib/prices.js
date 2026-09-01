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

const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens';

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

/**
 * Price one token, in USD and — when the pair quotes in ETH — in ETH directly.
 *
 * `priceNative` is the token denominated in the pair's quote asset. Where that
 * quote is WETH, it IS the token's ETH price, read from the pool, with no
 * dollar leg involved.
 *
 * That matters because the NFT floor is an ETH-denominated number. Computing it
 * as `token->USD->ETH` runs a round trip whose two dollar terms cancel, so the
 * external USD quote it depends on contributes nothing but a dependency and a
 * rounding step. Measured side by side: 5.559 via USD against 5.561 from the
 * pool.
 */
async function priceToken(tokenCa, signal) {
  const res = await fetch(`${DEXSCREENER}/${tokenCa}`, { signal });
  if (!res.ok) throw new Error(`dexscreener -> ${res.status}`);
  const j = await res.json();

  const best = bestPair(j?.pairs || [], tokenCa);
  if (!best) return null;

  let usd = parseFloat(best.priceUsd || 0);
  const native = parseFloat(best.priceNative || 0);
  const isQuote = best.quoteToken?.address?.toLowerCase() === tokenCa.toLowerCase();

  // When our token is the pair's QUOTE rather than its base, `priceUsd`
  // describes the other side of the pair. Inverting by priceNative recovers
  // ours; without this the header would confidently show a completely
  // unrelated token's price.
  if (isQuote && native > 0) usd = usd / native;

  if (!(usd > 0)) return null;

  // Only trust `native` as an ETH price when the quote asset really is ETH and
  // our token is the base. Anything else and `native` is denominated in some
  // third token, which would silently become a wrong floor.
  const quotedInEth = !isQuote && /^W?ETH$/i.test(best.quoteToken?.symbol || '');
  const eth = quotedInEth && native > 0 ? native : null;

  // The same pair prices ETH itself: token-in-USD over token-in-ETH. This is
  // where the header's ETH figure now comes from, rather than a separate feed.
  const impliedEthUsd = eth ? usd / eth : null;
  const trades = (best.txns?.h24?.buys || 0) + (best.txns?.h24?.sells || 0);

  return { usd, eth, impliedEthUsd, trades };
}

/**
 * Current ETH and per-project token prices.
 *
 * `projects` comes from gg-index's catalog, which is where the token addresses
 * live — data.json's `config` carries the NFT address but not the token's.
 */
export async function loadPrices(projects, signal, snapshot) {
  const extra = [];
  for (const [slug, p] of Object.entries(snapshot?.projects || {})) {
    if (projects?.some((c) => c.slug === slug)) continue;
    const token = p.config?.tokenCa;
    if (token) extra.push({ slug, contracts: [{ kind: 'token', address: token }] });
  }
  const list = [...(projects || []), ...extra];

  const entries = await Promise.allSettled(
    list.map(async (p) => {
      const token = p.contracts?.find((c) => c.kind === 'token')?.address;
      if (!token) return null;
      const priced = await priceToken(token, signal);
      return priced ? [p.slug, priced] : null;
    }),
  );

  const tokens = {};
  for (const e of entries) {
    if (e.status === 'fulfilled' && e.value) tokens[e.value[0]] = e.value[1];
    else if (e.status === 'rejected') console.warn('price fetch failed', e.reason);
  }

  // ETH is priced by the busiest ETH-quoted pool we looked at. Busiest rather
  // than first: every such pool implies an ETH price, and the one with the most
  // trades is the one least moved by a single swap.
  const implied = Object.values(tokens)
    .filter((t) => t.impliedEthUsd > 0)
    .sort((a, b) => b.trades - a.trades)[0]?.impliedEthUsd;

  return { ethPriceUsd: implied ? +implied.toFixed(2) : null, tokens };
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
  if (!base?.projects || !(prices?.ethPriceUsd > 0)) return base;

  const projects = { ...base.projects };
  for (const [slug, p] of Object.entries(projects)) {
    const priced = prices.tokens[slug];
    const tokenPrice = priced?.usd ?? p.market?.tokenPriceUsd;
    if (!(tokenPrice > 0)) continue;

    const unitValue = p.config?.unitValue;
    const market = {
      ...p.market,
      ethPriceUsd: prices.ethPriceUsd,
      tokenPriceUsd: tokenPrice,
    };

    if (unitValue > 0 && p.config?.nftCa && p.market?.floorSource !== 'opensea') {
      // Straight from the pool where the pair quotes in ETH; otherwise fall
      // back to the dollar round trip, which is the same number by a longer
      // route and only differs in rounding.
      const floorEth = priced?.eth
        ? unitValue * priced.eth * 1.1
        : (unitValue * tokenPrice * 1.1) / prices.ethPriceUsd;

      if (floorEth > 0 && Number.isFinite(floorEth)) {
        market.nftFloorEth = +floorEth.toFixed(3);
      }
    }

    projects[slug] = { ...p, market };
  }

  return { ...base, projects };
}
