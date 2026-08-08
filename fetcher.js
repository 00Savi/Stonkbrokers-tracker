const fs = require("fs");

const API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW";
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;
const ACTIVATION_MANAGER = "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664";
const TOTAL_SUPPLY = 4444;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ========== TOKEN PRICES ==========
const TOKEN_TICKERS = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": null,
  "0xe934e36a439c94017b64a3fece66af12099abf50": null,
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": "AAPL",
  "0x12f190a9f9d7d37a250758b26824b97ce941bf54": "AMZN",
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": "NVDA",
  "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f": "SLV",
  "0xe93237c50d904957cf27e7b1133b510c669c2e74": "MSFT",
  "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2": "COST",
  "0xd917b029c761d264c6a312bbbcda868658ef86a6": "USAR",
  "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea": "SPCX",
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": "GOOGL",
  "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c": "RDDT",
  "0x1b0e319c6a659f002271b69db8a7df2f911c153e": "GME",
  "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344": "USO",
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": null,
  "0x1383b43aed527485f191b60060f5b5471f71b1ca": null
};

let prices = {};
let market = { ethPriceUsd: 1900, tokenPriceUsd: 0.03, nftFloorEth: 10 };

// Current manual benchmarks (will be replaced by auto-discovery in Phase B)
const tierBenchmarks = [
  { tier: 1, reqTokens: 66666,   benchmarkId: 3032, tbaAddresses: ["0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9"] },
  { tier: 2, reqTokens: 166666,  benchmarkId: 1199, tbaAddresses: ["0xc2614c45c68f14a6c21881290c62d84b5f718831"] },
  { tier: 3, reqTokens: 366666,  benchmarkId: 2372, tbaAddresses: ["0xa72288ba58858c04b058ffc22ad345687924bcd0"] },
  { tier: 4, reqTokens: 666666,  benchmarkId: 1533, tbaAddresses: ["0x468a5a2402fa721f056b22e0c48d7010016135d8"] },
  { tier: 5, reqTokens: 1666666, benchmarkId: 1258, tbaAddresses: ["0xe7207caa913b54aa4411e847a3a49eee0568cccf"] }
];

async function secureFetch(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "StonkBrokersTracker/1.3" }
      });
      if (res.status === 429) throw new Error("rate limit");
      return await res.json();
    } catch (e) {
      console.log(`  retry ${i + 1}...`);
      await sleep(3000 + i * 2000);
    }
  }
  return { result: [] };
}

async function fetchYahooPrice(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const d = await res.json();
    return d?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch { return null; }
}

async function loadPrices() {
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker");
    const j = await r.json();
    market.ethPriceUsd = parseFloat(j.price);
    prices["0x0bd7d308f8e1639fab988df18a8011f41eacad73"] = market.ethPriceUsd;
  } catch {}

  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xe934e36a439c94017b64a3fece66af12099abf50");
    const j = await r.json();
    if (j?.pairs?.length) {
      const best = j.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      market.tokenPriceUsd = parseFloat(best.priceUsd);
      prices["0xe934e36a439c94017b64a3fece66af12099abf50"] = market.tokenPriceUsd;
    }
  } catch {}

  for (const [addr, ticker] of Object.entries(TOKEN_TICKERS)) {
    if (!ticker) {
      if (addr.includes("5fc5360d") || addr.includes("1383b43a")) prices[addr] = 1.0;
      continue;
    }
    const p = await fetchYahooPrice(ticker);
    if (p) {
      prices[addr] = p;
      console.log(`  ${ticker}: $${p.toFixed(2)}`);
    }
    await sleep(200);
  }

  market.nftFloorEth = +((666666 * market.tokenPriceUsd) / market.ethPriceUsd).toFixed(3);
  console.log(`Market → ETH $${market.ethPriceUsd.toFixed(2)} | STONK $${market.tokenPriceUsd.toFixed(5)} | Floor ${market.nftFloorEth} ETH`);
}

// ========== ACTIVATION STATS (Phase A) ==========
async function getActivationStats() {
  console.log("\nFetching activation stats...");

  // 1. Get total active count
  const countUrl = `${PRO_API}?chain_id=${CHAIN_ID}&module=proxy&action=eth_call&to=${ACTIVATION_MANAGER}&data=0x0b7e566a&apikey=${API_KEY}`; // activeCount()
  // Better: use the verified function
  // activeCount() selector = keccak256("activeCount()")[:4
