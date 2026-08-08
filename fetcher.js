const fs = require("fs");
const { ethers } = require("ethers");

const API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW";
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Protocol contracts that distribute yield
const PROTOCOL_CONTRACTS = [
  "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9", // CLOCK IN V2
  "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c"  // SAFETY DEPOSIT CLOCK IN (FEE ROUTER)
];

const ACTIVATION_MANAGER = "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664".toLowerCase();

// We cast a wide net with standard permutations of the event signatures.
// ethers.js will automatically match the correct one based on the Topic0 hash on-chain.
const ACTIVATION_ABI = [
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint8 tier, uint256 feePaid)",
  "event ActivationCleared(uint256 indexed tokenId)",
  "event ActivationCleared(uint256 tokenId)"
];
const iface = new ethers.Interface(ACTIVATION_ABI);

let prices = {};
let market = { ethPriceUsd: 1900, tokenPriceUsd: 0.03, nftFloorEth: 10 };

const tierBenchmarks = [
  { tier: "T0", name: "Floor Trader", reqTokens: 66666, benchmarkId: 3032, tbaAddress: "0x5a35bc7e3b7f0ea5b04d6df5e15aee144c940ba9", multiplier: "1.00x" },
  { tier: "T1", name: "Analyst", reqTokens: 166666, benchmarkId: 1199, tbaAddress: "0xc2614c45c68f14a6c21881290c62d84b5f718831", multiplier: "1.25x" },
  { tier: "T2", name: "Portfolio Manager", reqTokens: 366666, benchmarkId: 2372, tbaAddress: "0xa72288ba58858c04b058ffc22ad345687924bcd0", multiplier: "1.60x" },
  { tier: "T3", name: "Managing Director", reqTokens: 666666, benchmarkId: 1533, tbaAddress: "0x468a5a2402fa721f056b22e0c48d7010016135d8", multiplier: "2.00x" },
  { tier: "T4", name: "Partner", reqTokens: 1666666, benchmarkId: 1258, tbaAddress: "0xe7207caa913b54aa4411e847a3a49eee0568cccf", multiplier: "3.33x" }
];

async function secureFetch(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "StonkBrokersTracker/2.0" }
      });
      if (res.status === 429) throw new Error("rate");
      return await res.json();
    } catch (e) {
      console.log("  retry...");
      await sleep(2000 + i * 1500);
    }
  }
  return { result: [] };
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
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const d = await res.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p) {
        prices[addr] = p;
        console.log(`  ${ticker}: $${p.toFixed(2)}`);
      }
    } catch {}
    await sleep(150);
  }

  // 10% fee mapping applied
  market.nftFloorEth = +((666666 * market.tokenPriceUsd * 1.10) / market.ethPriceUsd).toFixed(3);
  console.log(`Market → ETH $${market.ethPriceUsd.toFixed(2)} | STONK $${market.tokenPriceUsd.toFixed(5)}`);
}

async function fetchActivations() {
  console.log("Fetching activation logs from chain...");
  let allLogs = [];
  let currentBlock = 0;
  
  while (true) {
    const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=logs&action=getLogs&address=${ACTIVATION_MANAGER}&fromBlock=${currentBlock}&toBlock=latest&apikey=${API_KEY}`;
    const data = await secureFetch(url);
    const logs = Array.isArray(data.result) ? data.result : [];
    
    if (logs.length === 0) break;
    
    allLogs.push(...logs);
    console.log(`  Found ${logs.length} logs...`);
    
    // Blockscout max limit per request is 1000. If less, we've hit the end.
    if (logs.length < 1000) break;
    
    // Advance block pointer to paginate safely. Handle hex or decimal returns seamlessly.
    const lastBlock = logs[logs.length - 1].blockNumber.toString();
    currentBlock = (lastBlock.startsWith("0x") ? parseInt(lastBlock, 16) : parseInt(lastBlock, 10)) + 1;
    await sleep(400);
  }

  // Sort chronologically by block number and log index to replay history perfectly
  allLogs.sort((a, b) => {
    const blockA = a.blockNumber.toString().startsWith("0x") ? parseInt(a.blockNumber, 16) : parseInt(a.blockNumber, 10);
    const blockB = b.blockNumber.toString().startsWith("0x") ? parseInt(b.blockNumber, 16) : parseInt(b.blockNumber, 10);
    if (blockA !== blockB) return blockA - blockB;
    
    const logIdxA = a.logIndex.toString().startsWith("0x") ? parseInt(a.logIndex, 16) : parseInt(a.logIndex, 10);
    const logIdxB = b.logIndex.toString().startsWith("0x") ? parseInt(b.logIndex, 16) : parseInt(b.logIndex, 10);
    return logIdxA - logIdxB;
  });

  const activeBrokers = new Map(); // tokenId -> tier Label
  const historyMap = new Map(); // end-of-day timestamp -> total active count

  for (const log of allLogs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (!parsed) continue;

      const timeStampVal = log.timeStamp.toString().startsWith("0x") ? parseInt(log.timeStamp, 16) : parseInt(log.timeStamp, 10);
      const logTimeMs = timeStampVal * 1000;
      const dayKey = new Date(logTimeMs).setUTCHours(0,0,0,0);
      
      const tokenId = parsed.args.tokenId.toString();

      if (parsed.name === "Activated") {
        const rawTier = parsed.args.tier.toString();
        activeBrokers.set(tokenId, `T${rawTier}`);
      } else if (parsed.name === "ActivationCleared") {
        activeBrokers.delete(tokenId);
      }

      historyMap.set(dayKey, activeBrokers.size);
    } catch (e) {
      // Ignore random contract events that don't match our specific ABI
    }
  }

  // Build the live tier breakdown
  const breakdown = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
  for (const tier of activeBrokers.values()) {
    if (breakdown[tier] !== undefined) {
      breakdown[tier]++;
    } else {
      breakdown[tier] = 1; 
    }
  }

  // Generate a rolling 7-day cumulative lookback for the Line Chart
  const today = new Date().setUTCHours(0,0,0,0);
  const labels = [];
  const cumulative = [];
  
  for (let i = 6; i >= 0; i--) {
    const targetDay = today - (i * 24 * 60 * 60 * 1000);
    const dateObj = new Date(targetDay);
    labels.push(`${dateObj.getUTCMonth()+1}/${dateObj.getUTCDate()}`);
    
    let historicalCount = 0;
    let closestTime = 0;
    
    // Find the latest active count recorded prior to or on this target day
    for (const [time, count] of historyMap.entries()) {
      if (time <= targetDay && time > closestTime) {
         closestTime = time;
         historicalCount = count;
      }
    }
    cumulative.push(historicalCount);
  }

  // Ensure the final data point represents the exact live state right now
  cumulative[6] = activeBrokers.size;
  
  const activeCount = activeBrokers.size;
  const totalSupply = 4444;

  console.log(`Live Activations: ${activeCount}/${totalSupply} (${((activeCount/totalSupply)*100).toFixed(2)}%)`);

  return {
    activeCount,
    totalSupply,
    percentActivated: +((activeCount / totalSupply) * 100).toFixed(2),
    breakdown,
    history: { labels, cumulative }
  };
}

async function getYield(tba, startBlock, sevenDaysAgo) {
  let total = 0;
  const tbaL = tba.toLowerCase();

  for (const action of ["txlist", "txlistinternal"]) {
    const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=${action}&address=${tba}&startblock=${startBlock}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`;
    const data = await secureFetch(url);
    const list = Array.isArray(data.result) ? data.result : [];
    for (const tx of list) {
      const ts = parseInt(tx.timeStamp || 0, 10);
      if (ts < sevenDaysAgo) continue;
      if ((tx.to || "").toLowerCase() !== tbaL) continue;
      if (tx.isError && tx.isError !== "0") continue;
      
      const fromAddr = (tx.from || "").toLowerCase();
      if (!PROTOCOL_CONTRACTS.includes(fromAddr)) continue;

      const eth = Number(tx.value || 0) / 1e18;
      if (eth > 0) total += eth * market.ethPriceUsd;
    }
    await sleep(400);
  }

  for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
    const price = prices[tokenAddr];
    if (!price) continue;
    const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${tba}&contractaddress=${tokenAddr}&startblock=${startBlock}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`;
    const data = await secureFetch(url);
    const list = Array.isArray(data.result) ? data.result : [];
    for (const tx of list) {
      const ts = parseInt(tx.timeStamp || 0, 10);
      if (ts < sevenDaysAgo) continue;
      if ((tx.to || "").toLowerCase() !== tbaL) continue;
      if (tx.isError && tx.isError !== "0") continue;
      
      const fromAddr = (tx.from || "").toLowerCase();
      if (!PROTOCOL_CONTRACTS.includes(fromAddr)) continue;

      const decimals = tx.tokenDecimal ? parseInt(tx.tokenDecimal, 10) : 18;
      const amount = Number(tx.value || 0) / Math.pow(10, decimals);
      if (amount > 0) total += amount * price;
    }
    await sleep(300);
  }

  return total;
}

async function run() {
  console.log("Starting Dashboard Build...");
  await loadPrices();

  let currentBlock = 31300000;
  try {
    const br = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=block&action=eth_block_number&apikey=${API_KEY}`);
    if (br.result) currentBlock = parseInt(br.result, 16);
  } catch {}

  const startBlock = Math.max(0, currentBlock - 6100000); 
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  // Retrieve on-chain activation stats
  const activationStats = await fetchActivations();

  console.log("\nScanning Yield for Benchmark Wallets from block", startBlock);
  const results = [];
  for (const bm of tierBenchmarks) {
    console.log(`Tier ${bm.tier} - ${bm.tbaAddress}`);
    const sevenDay = await getYield(bm.tbaAddress, startBlock, sevenDaysAgo);
    const annual = sevenDay * 52.14;
    console.log(`  7d: $${sevenDay.toFixed(2)} → annual $${annual.toFixed(2)}`);
    results.push({
      tier: bm.tier,
      name: bm.name,
      reqTokens: bm.reqTokens,
      multiplier: bm.multiplier,
      benchmarkId: bm.benchmarkId,
      tbaAddress: bm.tbaAddress,
      trackedAnnualYieldUsd: annual
    });
  }

  const out = {
    market,
    activation: activationStats,
    tiers: results,
    lastUpdated: new Date().toISOString()
  };

  fs.writeFileSync("data.json", JSON.stringify(out, null, 2));
  console.log("\n✓ Dashboard data payload generated successfully.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
