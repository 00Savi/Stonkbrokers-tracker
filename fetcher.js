const fs = require("fs");
const { ethers } = require("ethers");

const API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW";
const PRO_API = "https://api.blockscout.com/v2/api";
const DIRECT_API = "https://robinhoodchain.blockscout.com/api"; // Fallback for L2 internal trace bugs
const CHAIN_ID = 4663;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TOKEN_TICKERS = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": null,     // WETH
  "0xe934e36a439c94017b64a3fece66af12099abf50": "STONK", // STONKBROKER
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
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168": null,     // USDG
  "0x1383b43aed527485f191b60060f5b5471f71b1ca": null,
  
  // DEX Reward Tokens
  "0xc72f232a6869e6cf34dc06129affd07f8a2a246a": "DEX", // MANCER
  "0xf33b89c958b12b0c8be77c6d65a59e3130031558": "DEX", // MTH
  "0xd7fcd16a55742bcce96c90484551b077d715195f": "DEX", // BOX
  "0x5d111f5083c89589009d1d64eadd84dc615836b4": "DEX", // STONKEXCHANGE
  "0x020bfc650a365f8bb26819deaabf3e21291018b4": "DEX", // CASHCAT
  "0x6245e67affa44a23077f0ea7f981a8dc743a0c47": "DEX", // FRONG
  "0x27efeae1817d90974623cb2ed455c424beffa5ab": "DEX"  // FRONG (V2)
};

const FALLBACK_STOCK_PRICES = {
  "AAPL": 220, "AMZN": 180, "NVDA": 120, "SLV": 27, "MSFT": 420,
  "COST": 850, "USAR": 25, "SPCX": 30, "GOOGL": 165, "RDDT": 60,
  "GME": 20, "USO": 75
};

const ACTIVATION_MANAGER = "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664".toLowerCase();
const NFT_CONTRACT = "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0".toLowerCase();

const PROTOCOL_CONTRACTS = [
  "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9", // DIRECTED CLOCK IN BOOSTER
  "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c"  // SAFETY DEPOSIT CLOCK IN
];

const ACTIVATION_ABI = [
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint8 tier, uint8 tierBytes, uint256 feePaid)",
  "event ActivationCleared(uint256 indexed tokenId)",
  "event ActivationCleared(uint256 tokenId)"
];
const iface = new ethers.Interface(ACTIVATION_ABI);

let prices = {};
let market = { ethPriceUsd: 1917, tokenPriceUsd: 0.0308, nftFloorEth: 11.77 };

const tierStructure = [
  { id: "T0", name: "Floor Trader", reqTokens: 66666, weight: 100 },
  { id: "T1", name: "Analyst", reqTokens: 166666, weight: 125 },
  { id: "T2", name: "Portfolio Manager", reqTokens: 366666, weight: 160 },
  { id: "T3", name: "Managing Director", reqTokens: 666666, weight: 200 },
  { id: "T4", name: "Partner", reqTokens: 1666666, weight: 333 }
];

async function secureFetch(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "StonkBrokersTracker/6.0" } });
      if (res.status === 429) throw new Error("rate");
      return await res.json();
    } catch (e) {
      await sleep(2000 + i * 1500);
    }
  }
  return { result: [] };
}

async function loadPrices() {
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker");
    const j = await r.json();
    if (j?.price) market.ethPriceUsd = parseFloat(j.price);
  } catch {}
  prices["0x0bd7d308f8e1639fab988df18a8011f41eacad73"] = market.ethPriceUsd;

  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xe934e36a439c94017b64a3fece66af12099abf50");
    const j = await r.json();
    if (j?.pairs?.length) {
      const best = j.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      market.tokenPriceUsd = parseFloat(best.priceUsd);
    }
  } catch {}
  prices["0xe934e36a439c94017b64a3fece66af12099abf50"] = market.tokenPriceUsd;

  for (const [addr, ticker] of Object.entries(TOKEN_TICKERS)) {
    if (!ticker) {
      if (addr.includes("5fc5360d") || addr.includes("1383b43a")) prices[addr] = 1.0;
      continue;
    }
    
    if (ticker === "STONK") {
      prices[addr] = market.tokenPriceUsd;
      continue;
    }

    if (ticker === "DEX") {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
        const d = await res.json();
        if (d?.pairs?.length) {
          const best = d.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          prices[addr] = parseFloat(best.priceUsd);
        }
      } catch {}
      await sleep(150);
      continue;
    }

    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
      const d = await res.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p) {
        prices[addr] = p;
      } else {
        prices[addr] = FALLBACK_STOCK_PRICES[ticker] || 100;
      }
    } catch {
      prices[addr] = FALLBACK_STOCK_PRICES[ticker] || 100;
    }
    await sleep(150);
  }

  market.nftFloorEth = +((666666 * market.tokenPriceUsd * 1.10) / market.ethPriceUsd).toFixed(3);
}

async function getBurnEvents() {
  console.log("Fetching NFT burn events...");
  const burnEvents = [];
  const deadAddresses = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"];
  
  for (const addr of deadAddresses) {
    let page = 1;
    while(true) {
      const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokennfttx&contractaddress=${NFT_CONTRACT}&address=${addr}&page=${page}&offset=1000&sort=asc&apikey=${API_KEY}`;
      const data = await secureFetch(url);
      const txs = Array.isArray(data.result) ? data.result : [];
      if (txs.length === 0) break;
      
      for (const tx of txs) {
        if ((tx.to || "").toLowerCase() === addr) {
           burnEvents.push({
              isBurn: true,
              blockNumber: tx.blockNumber,
              logIndex: (parseInt(tx.transactionIndex || 0, 10) * 1000).toString(), 
              timeStamp: tx.timeStamp,
              tokenId: tx.tokenID
           });
        }
      }
      if (txs.length < 1000) break;
      page++;
      await sleep(250);
    }
  }
  return burnEvents;
}

async function fetchActivations() {
  console.log("Fetching activation logs via Dynamic Block Pointer...");
  let allLogs = [];
  
  let latestBlock = 35000000;
  try {
    const br = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=block&action=eth_block_number&apikey=${API_KEY}`);
    if (br.result) {
      latestBlock = br.result.toString().startsWith("0x") ? parseInt(br.result, 16) : parseInt(br.result, 10);
    }
  } catch {}

  let currentBlock = 0;
  let seenLogs = new Set(); 

  while (currentBlock <= latestBlock) {
    const url = `${PRO_API}?chain_id=${CHAIN_ID}&module=logs&action=getLogs&address=${ACTIVATION_MANAGER}&fromBlock=${currentBlock}&toBlock=latest&apikey=${API_KEY}`;
    const data = await secureFetch(url);
    const logs = Array.isArray(data.result) ? data.result : [];
    
    if (logs.length === 0) break;
    
    let lastBlockInChunk = currentBlock;

    for (const log of logs) {
      const logId = log.transactionHash + "-" + log.logIndex;
      if (!seenLogs.has(logId)) {
        seenLogs.add(logId);
        allLogs.push(log);
      }
      const bNum = log.blockNumber.toString().startsWith("0x") ? parseInt(log.blockNumber, 16) : parseInt(log.blockNumber, 10);
      if (bNum > lastBlockInChunk) lastBlockInChunk = bNum;
    }

    if (logs.length < 1000) break; 
    else currentBlock = lastBlockInChunk === currentBlock ? currentBlock + 1 : lastBlockInChunk;
    await sleep(300);
  }

  const burnEvents = await getBurnEvents();
  if (burnEvents.length > 0) allLogs.push(...burnEvents);

  allLogs.sort((a, b) => {
    const blockA = a.blockNumber.toString().startsWith("0x") ? parseInt(a.blockNumber, 16) : parseInt(a.blockNumber, 10);
    const blockB = b.blockNumber.toString().startsWith("0x") ? parseInt(b.blockNumber, 16) : parseInt(b.blockNumber, 10);
    if (blockA !== blockB) return blockA - blockB;
    
    const logIdxA = a.logIndex.toString().startsWith("0x") ? parseInt(a.logIndex, 16) : parseInt(a.logIndex, 10);
    const logIdxB = b.logIndex.toString().startsWith("0x") ? parseInt(b.logIndex, 16) : parseInt(b.logIndex, 10);
    return logIdxA - logIdxB;
  });

  const activeBrokers = new Map(); 
  for (const log of allLogs) {
    if (log.isBurn) {
        const tokenId = log.tokenId.toString();
        if (activeBrokers.has(tokenId)) activeBrokers.delete(tokenId);
        continue;
    }

    try {
      const topics = log.topics && Array.isArray(log.topics) ? log.topics.filter(t => t !== null) : 
                     [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t);

      const parsed = iface.parseLog({ topics, data: log.data });
      if (!parsed) continue;

      const tokenId = parsed.args.tokenId.toString();
      if (parsed.name === "Activated") {
        activeBrokers.set(tokenId, `T${parsed.args.tier.toString()}`);
      } else if (parsed.name === "ActivationCleared") {
        activeBrokers.delete(tokenId);
      }
    } catch (e) {}
  }

  const breakdown = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
  for (const tier of activeBrokers.values()) {
    if (breakdown[tier] !== undefined) breakdown[tier]++;
  }

  return { activeCount: activeBrokers.size, breakdown };
}

async function getGlobalYield(sevenDaysAgo, activationStats) {
  console.log("Fetching Yield via Dual-Capture T4 Oracle (Wallet Sampling)...");
  
  const SAMPLE_WALLET = "0xe7207caa913b54aa4411e847a3a49eee0568cccf".toLowerCase();
  const SAMPLE_WEIGHT = 333; 
  let sampleEthInflow = 0;
  let sampleErc20Usd = 0;

  console.log("1. Tracking Native ETH deposited to Oracle Wallet...");
  let pageEth = 1;
  while(true) {
      // PRO API often drops internal traces for L2s, so we attempt the PRO api and instantly fallback to the direct explorer
      let urlEth = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=txlistinternal&address=${SAMPLE_WALLET}&page=${pageEth}&offset=1000&sort=desc&apikey=${API_KEY}`;
      let dataEth = await secureFetch(urlEth);
      
      // Fallback if Pro API returns empty data
      if (!dataEth.result || dataEth.result.length === 0) {
          urlEth = `${DIRECT_API}?module=account&action=txlistinternal&address=${SAMPLE_WALLET}&page=${pageEth}&offset=1000&sort=desc`;
          dataEth = await secureFetch(urlEth);
      }
      
      const txs = Array.isArray(dataEth.result) ? dataEth.result : [];
      if(txs.length === 0) break;
      
      let reachedOlder = false;
      for (const tx of txs) {
        const ts = parseInt(tx.timeStamp || tx.timestamp || tx.UnixTimestamp || 0, 10);
        if (ts < sevenDaysAgo) {
          reachedOlder = true;
          continue;
        }
        if (tx.isError === "1" || tx.isError === 1) continue;
        
        const fromAddr = (tx.from || tx.fromAddress || tx.contractAddress || "").toLowerCase();
        const toAddr = (tx.to || tx.toAddress || "").toLowerCase();
        
        if (PROTOCOL_CONTRACTS.includes(fromAddr) && toAddr === SAMPLE_WALLET) {
          const eth = Number(tx.value || tx.Value || 0) / 1e18;
          if (eth > 0) sampleEthInflow += eth;
        }
      }
      
      if(reachedOlder || txs.length < 1000) break;
      pageEth++;
      await sleep(300);
  }

  console.log(`  -> Oracle 7D ETH Captured: ${sampleEthInflow.toFixed(6)} ETH`);

  console.log("2. Tracking Tracked ERC-20 Tokens deposited to Oracle Wallet...");
  for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
    const price = prices[tokenAddr] || 0;
    if (price <= 0) continue;
    
    let pageTok = 1;
    while(true) {
        const urlTok = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${SAMPLE_WALLET}&contractaddress=${tokenAddr}&page=${pageTok}&offset=1000&sort=desc&apikey=${API_KEY}`;
        const dataTok = await secureFetch(urlTok);
        const txs = Array.isArray(dataTok.result) ? dataTok.result : [];
        if(txs.length === 0) break;

        let reachedOlder = false;
        for (const tx of txs) {
          const ts = parseInt(tx.timeStamp || tx.timestamp || tx.UnixTimestamp || 0, 10);
          if (ts < sevenDaysAgo) {
            reachedOlder = true;
            continue;
          }
          if (tx.isError === "1" || tx.isError === 1) continue;
          
          const fromAddr = (tx.from || tx.fromAddress || "").toLowerCase();
          const toAddr = (tx.to || tx.toAddress || "").toLowerCase();
          
          if (PROTOCOL_CONTRACTS.includes(fromAddr) && toAddr === SAMPLE_WALLET) {
            const decRaw = tx.tokenDecimal || tx.decimals || 18;
            const decimals = parseInt(decRaw, 10);
            const amount = Number(tx.value || tx.Value || 0) / Math.pow(10, decimals);
            if (amount > 0) sampleErc20Usd += (amount * price);
          }
        }
        
        if(reachedOlder || txs.length < 1000) break;
        pageTok++;
        await sleep(300);
    }
  }

  console.log(`  -> Oracle 7D ERC-20 Captured: $${sampleErc20Usd.toFixed(2)}`);

  const sampleEthUsd = sampleEthInflow * market.ethPriceUsd;
  const totalSampleUsd = sampleEthUsd + sampleErc20Usd;
  
  let totalNetworkWeight = 0;
  for (const t of tierStructure) {
    const activeInTier = activationStats.breakdown[t.id] || 0;
    totalNetworkWeight += (activeInTier * t.weight);
  }
  
  const usdPerWeightUnit = totalSampleUsd / SAMPLE_WEIGHT;
  const global7DayUsd = usdPerWeightUnit * totalNetworkWeight;
  
  return global7DayUsd;
}

async function run() {
  console.log("Starting Dashboard Build...");
  await loadPrices();

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const activationStats = await fetchActivations();
  const global7DayYield = await getGlobalYield(sevenDaysAgo, activationStats);
  const globalAnnualYield = global7DayYield * 52.14;

  let totalNetworkWeight = 0;
  for (const t of tierStructure) {
    const activeInTier = activationStats.breakdown[t.id] || 0;
    totalNetworkWeight += (activeInTier * t.weight);
  }

  const yieldPerWeightUnitAnnual = totalNetworkWeight > 0 ? (globalAnnualYield / totalNetworkWeight) : 0;
  
  const results = [];
  for (const t of tierStructure) {
    const tierExpectedAnnualUsd = t.weight * yieldPerWeightUnitAnnual;
    results.push({
      tier: t.id,
      name: t.name,
      reqTokens: t.reqTokens,
      multiplier: `${(t.weight/100).toFixed(2)}x`, 
      weight: t.weight,
      trackedAnnualYieldUsd: tierExpectedAnnualUsd
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

// THIS IS THE EXECUTION COMMAND THAT WAS MISSING
run().catch(err => {
  console.error(err);
  process.exit(1);
});
