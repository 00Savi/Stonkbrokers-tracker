/** TickerYard CCIP wrap (yBTC live, yXAUT coded). Verified on-chain 2026-09-17. */

export const YARD_WRAP = {
  site: 'https://tickeryard.com/',
  ybtc: '0x9715e0a0a5f60dCa2A3F69d81Fb7f975De5870Ed',
  gateway: '0x9fa6a54dbC2D69E232768e4E0970913755571e19',
  arbVault: '0x54d5100A8793a6788472A2f0ca067D05fd7E87D2',
  wbtcArb: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  wrapFeeBps: 30,
  ybtcDecimals: 8,
  nextAsset: 'yXAUT',
};

export function ybtcAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n / 10 ** YARD_WRAP.ybtcDecimals;
}

export async function fetchYardWrap() {
  const ybtc = YARD_WRAP.ybtc;
  const out = {
    wrapFeeBps: YARD_WRAP.wrapFeeBps,
    ybtcSupply: 0,
    ybtcPriceUsd: 0,
    ybtcUsd: 0,
    yxautLive: false,
  };
  try {
    const res = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${ybtc}`);
    if (res.ok) {
      const j = await res.json();
      out.ybtcSupply = ybtcAmount(j.total_supply);
    }
  } catch {
    /* DexScreener fills supply from fdv/price if Blockscout is blocked. */
  }
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ybtc}`);
    if (res.ok) {
      const j = await res.json();
      const pairs = (j.pairs || []).filter((p) => p.chainId === 'robinhood' && p.baseToken?.address?.toLowerCase() === ybtc.toLowerCase());
      const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (best) {
        out.ybtcPriceUsd = Number(best.priceUsd) || 0;
        const fdv = Number(best.fdv) || 0;
        if (!(out.ybtcSupply > 0) && out.ybtcPriceUsd > 0 && fdv > 0) out.ybtcSupply = fdv / out.ybtcPriceUsd;
      }
    }
  } catch {
    /* wrap tiles stay on the 0.30% fee even without a live mark. */
  }
  out.ybtcUsd = out.ybtcSupply * out.ybtcPriceUsd;
  return out;
}
