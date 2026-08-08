const fs = require("fs");

const API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW";
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Token address → Yahoo ticker (null = special case)
const TOKEN_TICKERS = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": null, // WETH
  "0xe934e36a439c94017b64a3fece66af12099abf50": null, // STONKBROKER
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
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": null, // USDG = $1
  "0x1383b43aed527485f191b60060f5b5471f71b1ca": null  // USDG V2 = $1
};

let prices = {};
let market = { ethPriceUsd: 1900, tokenPriceUsd: 0.03, nftFloorEth: 10 };

const tierBenchmarks = [
  { tier: 1, reqTokens: 66666,  benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", trackedAnnualYieldUsd: 0 },
  { tier: 2, reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", trackedAnnualYieldUsd: 0 },
  { tier: 3, reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", trackedAnnualYieldUsd: 0 },
  { tier: 4, reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", trackedAnnualYieldUsd: 0 },
  { tier: 5, reqTokens: 1666666,benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", trackedAnnualYieldUsd: 0 }
];

async function secureFetch(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "StonkBrokersTracker/1.1" }
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
  } catch {
    return null;
  }
}

async function loadPrices() {
  // ETH
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker");
    const j = await r.json();
    market.ethPriceUsd = parseFloat(j.price);
    prices["0x0bd7d308f8e1639fab988df18a8011f41eacad73"] = market.ethPriceUsd;
  } catch (e) {}

  // $STONKBROKER
  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xe934e36a439c94017b64a3fece66af12099abf50");
    const j = await r.json();
    if (j?.pairs?.length) {
      const best = j.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      market.tokenPriceUsd = parseFloat(best.priceUsd);
      prices["0xe934e36a439c94017b64a3fece66af12099abf50"] = market.tokenPriceUsd;
    }
  } catch (e) {}

  // Stock tokens
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
    await sleep(250);
  }

  market.nftFloorEth = +((666666 * market.tokenPriceUsd) / market.ethPriceUsd).toFixed(3);
  console.log(`Market → ETH $${market.ethPriceUsd.toFixed(2)} | STONK $${market.tokenPriceUsd.toFixed(5)} | Floor ${market.nftFloorEth} ETH`);
}

async function getAllInbound(tba, startBlock, sevenDaysAgo) {
  let totalUsd = 0;
  const tbaL = tba.toLowerCase();

  // Native ETH
  for (const action of ["txlist", "txlistinternal"]) {
    let page = 1;
    while (true) {
      const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=${action}&address=${tba}&startblock=${startBlock}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
      const data = await secureFetch(url);
      const list = Array.isArray(data.result) ? data.result : [];
      if (list.length === 0) break;

      for (const tx of list) {
        const ts = parseInt(tx.timeStamp || 0, 10);
        if (ts < sevenDaysAgo) continue;
        if ((tx.to || "").toLowerCase() !== tbaL) continue;
        if (tx.isError && tx.isError !== "0") continue;
        const eth = Number(tx.value || 0) / 1e18;
        if (eth > 0) totalUsd += eth * market.ethPriceUsd;
      }
      if (list.length < 1000) break;
      page++;
      await sleep(700);
    }
    await sleep(500);
  }

  // Tokens (isolated)
  for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
    const price = prices[tokenAddr];
    if (!price || price <= 0) continue;

    let page = 1;
    while (true) {
      const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${tba}&contractaddress=${tokenAddr}&startblock=${startBlock}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
      const data = await secureFetch(url);
      const list = Array.isArray(data.result) ? data.result : [];
      if (list.length === 0) break;

      for (const tx of list) {
        const ts = parseInt(tx.timeStamp || 0, 10);
        if (ts < sevenDaysAgo) continue;
        if ((tx.to || "").toLowerCase() !== tbaL) continue;
        if (tx.isError && tx.isError !== "0") continue;

        const decimals = tx.tokenDecimal ? parseInt(tx.tokenDecimal, 10) : 18;
        const amount = Number(tx.value || 0) / Math.pow(10, decimals);
        if (amount > 0) totalUsd += amount * price;
      }
      if (list.length < 1000) break;
      page++;
      await sleep(600);
    }
    await sleep(350);
  }

  return totalUsd;
}

async function run() {
  console.log("Loading live prices...");
  await loadPrices();

  let currentBlock = 31300000;
  try {
    const br = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=block&action=eth_block_number&apikey=${API_KEY}`);
    if (br.result) currentBlock = parseInt(br.result, 16);
  } catch (e) {}

  const startBlock = Math.max(0, currentBlock - 6100000);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  console.log(`Scanning from block ${startBlock}`);

  for (const bm of tierBenchmarks) {
    console.log(`\nTier ${bm.tier} – ${bm.tbaAddress}`);
    const sevenDayUsd = await getAllInbound(bm.tbaAddress, startBlock, sevenDaysAgo);
    bm.trackedAnnualYieldUsd = sevenDayUsd * 52.14;
    console.log(`  7d = $${sevenDayUsd.toFixed(2)} → annualized $${bm.trackedAnnualYieldUsd.toFixed(2)}`);
  }

  const out = {
    market,
    tiers: tierBenchmarks,
    lastUpdated: new Date().toISOString()
  };

  fs.writeFileSync("data.json", JSON.stringify(out, null, 2));
  console.log("\n✓ data.json written successfully");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
