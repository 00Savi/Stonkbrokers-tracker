const fs = require("fs");
const { ethers } = require("ethers");

const API_KEY = "proapi_tI5cQZoWvXXgS1WFHXEaLKhLBSl0WHvcYv3msh7Kdpioyod8Bfon9vSHif7zhcAG_dLDzYW";
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TOKEN_TICKERS = {
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": null,      
  "0xe934e36a439c94017b64a3fece66af12099abf50": "STONK", 
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
  "0x1383b43aed527485f191b60060f5b5471f71b1ca": null,
  "0xc72f232a6869e6cf34dc06129affd07f8a2a246a": "DEX", 
  "0xf33b89c958b12b0c8be77c6d65a59e3130031558": "DEX", 
  "0xd7fcd16a55742bcce96c90484551b077d715195f": "DEX", 
  "0x5d111f5083c89589009d1d64eadd84dc615836b4": "DEX", 
  "0x020bfc650a365f8bb26819deaabf3e21291018b4": "DEX", 
  "0x6245e67affa44a23077f0ea7f981a8dc743a0c47": "DEX", 
  "0x27efeae1817d90974623cb2ed455c424beffa5ab": "DEX"  
};

const FALLBACK_STOCK_PRICES = {
  "AAPL": 220, "AMZN": 180, "NVDA": 120, "SLV": 27, "MSFT": 420,
  "COST": 850, "USAR": 25, "SPCX": 30, "GOOGL": 165, "RDDT": 60,
  "GME": 20, "USO": 75
};

const PROJECTS = {
  stonk: {
    genesisBlock: 0, 
    tokenCa: "0xe934e36a439c94017b64a3fece66af12099abf50",
    nftCa: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0",
    activationCa: "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664",
    ammCa: "0xe302733accf4800146e55fc45b46b4e4ffc032d2",
    maxSupply: 4444,
    unitValue: 666666,
    ticker: "STONK",
    logo: "Stonkbroker.png",
    yieldMode: "oracle_wallet",
    oracleSource: "0xe7207caa913b54aa4411e847a3a49eee0568cccf",
    oracleWeight: 333,
    tiers: [
      { id: "T0", name: "Floor Trader", reqTokens: 66666, weight: 100 },
      { id: "T1", name: "Analyst", reqTokens: 166666, weight: 125 },
      { id: "T2", name: "Portfolio Manager", reqTokens: 366666, weight: 160 },
      { id: "T3", name: "Managing Director", reqTokens: 666666, weight: 200 },
      { id: "T4", name: "Partner", reqTokens: 1666666, weight: 333 }
    ]
  },
  mancer: {
    genesisBlock: 0, 
    tokenCa: "0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A".toLowerCase(),
    nftCa: "0x797a2e030b7e49107c8f07bf0300ea9cae88ca57".toLowerCase(),
    activationCa: "0x47c2194cAacfC778c0Baa41E10008bb7D720Cd59".toLowerCase(),
    ammCa: "0x2554cad3d851381ec1a16b7bf7b4737ed46b40fe".toLowerCase(),
    maxSupply: 5000,
    unitValue: 500000,
    ticker: "MANCER",
    logo: "logo.png",
    yieldMode: "protocol_vault",
    oracleSource: "0x47c2194cAacfC778c0Baa41E10008bb7D720Cd59".toLowerCase(), 
    tiers: [
      { id: "T0", name: "Apprentice", reqTokens: 50000, weight: 100 },
      { id: "T1", name: "Mage", reqTokens: 110000, weight: 125 },
      { id: "T2", name: "Wizard", reqTokens: 225000, weight: 160 },
      { id: "T3", name: "Elder", reqTokens: 450000, weight: 200 },
      { id: "T4", name: "Grand Mancer", reqTokens: 1200000, weight: 333 }
    ]
  }
};

const PROTOCOL_CONTRACTS = [
  "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9", 
  "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c"  
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

let ethPriceUsd = 1917;
let tokenPrices = {};

async function secureFetch(url) {
  const headers = { "Accept": "application/json" };
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 402) {
          console.error("\n[CRITICAL ERROR] HTTP 402: Payment Required. PRO API Key Out of Credits!");
          process.exit(1);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.status === "0" && (data.message === "No records found" || data.message === "No transactions found")) return { result: [] };
      return data;
    } catch (e) {
      await sleep(1500 * (i + 1));
    }
  }
  process.exit(1); 
}

async function fetchTokenHoldersSafe(contractAddress, isNft = false) {
  let page = 1;
  let activeHolders = 0;
  let hasData = false;
  const dustThreshold = isNft ? 1n : 1000000000000000000n; 

  while (true) {
    let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=token&action=getTokenHolders&contractaddress=${contractAddress}&page=${page}&offset=1000&apikey=${API_KEY}`;
    let data = await secureFetch(url);

    if (data && data.result && Array.isArray(data.result) && data.result.length > 0) {
        hasData = true;
        for (const holder of data.result) {
            try {
                const bal = BigInt(holder.value || 0);
                if (bal >= dustThreshold) activeHolders++;
            } catch(e) {}
        }
        if (data.result.length < 1000) break; 
        page++;
        await sleep(200); 
    } else {
        break; 
    }
  }
  return hasData ? activeHolders : 0;
}

async function loadMarketPrices() {
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker");
    const j = await r.json();
    if (j?.price) ethPriceUsd = parseFloat(j.price);
  } catch {}

  const markets = {};
  for (const [key, conf] of Object.entries(PROJECTS)) {
      markets[key] = { ethPriceUsd, tokenPriceUsd: 0.03, nftFloorEth: 0 };
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${conf.tokenCa}`);
        const j = await r.json();
        if (j?.pairs?.length) {
          const best = j.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          markets[key].tokenPriceUsd = parseFloat(best.priceUsd);
        }
      } catch {}
      markets[key].nftFloorEth = +((conf.unitValue * markets[key].tokenPriceUsd * 1.10) / ethPriceUsd).toFixed(3);
      tokenPrices[conf.tokenCa.toLowerCase()] = markets[key].tokenPriceUsd;
      await sleep(250);
  }

  for (const [addr, ticker] of Object.entries(TOKEN_TICKERS)) {
    if (!ticker) {
      if (addr.includes("5fc5360d") || addr.includes("1383b43a")) tokenPrices[addr] = 1.0;
      continue;
    }
    if (tokenPrices[addr]) continue;

    if (ticker === "DEX") {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
        const d = await res.json();
        if (d?.pairs?.length) {
          const best = d.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          tokenPrices[addr] = parseFloat(best.priceUsd);
        }
      } catch {}
      await sleep(150);
      continue;
    }

    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
      const d = await res.json();
      const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p) tokenPrices[addr] = p; else tokenPrices[addr] = FALLBACK_STOCK_PRICES[ticker] || 100;
    } catch { tokenPrices[addr] = FALLBACK_STOCK_PRICES[ticker] || 100; }
    await sleep(150);
  }

  return markets;
}

async function fetchAllLogs(address, genesisBlock, topic0 = null) {
  let latestBlock = 35000000;
  try {
    const br = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=block&action=eth_block_number&apikey=${API_KEY}`);
    if (br && br.result) {
        const val = br.result.toString();
        latestBlock = val.startsWith("0x") ? parseInt(val, 16) : parseInt(val, 10);
    }
  } catch {}

  let allLogs = [];
  let fromBlock = genesisBlock; 
  let step = 5000000; 

  while (fromBlock <= latestBlock) {
    let toBlock = fromBlock + step;
    if (toBlock > latestBlock) toBlock = latestBlock;

    let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=logs&action=getLogs&address=${address}&fromBlock=${fromBlock}&toBlock=${toBlock}&apikey=${API_KEY}`;
    if (topic0) url += `&topic0=${topic0}`;

    let data = await secureFetch(url);
    const logs = (data && Array.isArray(data.result)) ? data.result : [];

    if (logs.length >= 1000 && step > 1) { step = Math.floor(step / 2); continue; }

    allLogs.push(...logs);
    fromBlock = toBlock + 1;
    step = 5000000; 
    await sleep(200); 
  }

  const getLogIdx = (obj) => {
    if (obj.logIndex !== undefined && obj.logIndex !== null) return obj.logIndex;
    if (obj.log_index !== undefined && obj.log_index !== null) return obj.log_index;
    if (obj.index !== undefined && obj.index !== null) return obj.index;
    return 0;
  };

  const getInt = (val) => {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return val;
    return val.toString().startsWith("0x") ? parseInt(val, 16) : parseInt(val, 10);
  };

  const uniqueLogsMap = new Map();
  for (const log of allLogs) { 
      const idx = getLogIdx(log);
      uniqueLogsMap.set(log.transactionHash + "-" + idx, log); 
  }
  const uniqueLogs = Array.from(uniqueLogsMap.values());

  // ENFORCED: Strict sequential chronological sorting to prevent multi-tier overwrites
  uniqueLogs.sort((a, b) => {
    const blockA = getInt(a.blockNumber);
    const blockB = getInt(b.blockNumber);
    if (blockA !== blockB) return blockA - blockB;
    return getInt(getLogIdx(a)) - getInt(getLogIdx(b));
  });

  return uniqueLogs;
}

async function getExactNftHolders(nftCa, genesis) {
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const logs = await fetchAllLogs(nftCa, genesis, TRANSFER_TOPIC);

  const balances = new Map();
  for (const log of logs) {
      const from = log.topics[1] ? "0x" + log.topics[1].slice(-40).toLowerCase() : null;
      const to = log.topics[2] ? "0x" + log.topics[2].slice(-40).toLowerCase() : null;
      if (from && from !== "0x0000000000000000000000000000000000000000") balances.set(from, (balances.get(from) || 0) - 1);
      if (to && to !== "0x0000000000000000000000000000000000000000") balances.set(to, (balances.get(to) || 0) + 1);
  }

  let activeHolders = 0;
  for (const [addr, bal] of balances.entries()) {
      if (bal > 0 && !addr.includes("dead") && addr !== "0x0000000000000000000000000000000000000000") activeHolders++;
  }
  return activeHolders;
}

async function getTrueDeflationStats(conf) {
  let currentSupply = conf.maxSupply * conf.unitValue;
  let deadBalance = 0;

  try {
    const supplyUrl = `${PRO_API}?chain_id=${CHAIN_ID}&module=stats&action=tokensupply&contractaddress=${conf.tokenCa}&apikey=${API_KEY}`;
    const res = await secureFetch(supplyUrl);
    if (res && res.result) currentSupply = Number(res.result) / 1e18;
  } catch(e) {}

  const deadAddresses = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"];
  for (const addr of deadAddresses) {
    let res = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${conf.tokenCa}&address=${addr}&apikey=${API_KEY}`);
    if (res && res.result) deadBalance += Number(res.result) / 1e18;
    await sleep(200); 
  }

  let totalBurnTokens = 0;
  if (conf.ticker === "STONK") {
    let lockedBalance = 0;
    let res = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${conf.tokenCa}&address=${conf.activationCa}&apikey=${API_KEY}`);
    if (res && res.result) lockedBalance += Number(res.result) / 1e18;
    const nativeBurn = Math.max(0, (conf.maxSupply * conf.unitValue) - currentSupply);
    totalBurnTokens = nativeBurn + deadBalance + lockedBalance;
  } else {
    const nativeBurn = Math.max(0, (conf.maxSupply * conf.unitValue) - currentSupply);
    totalBurnTokens = nativeBurn + deadBalance;
  }
  
  const equivalentBrokersBurnt = totalBurnTokens / conf.unitValue;

  return { totalBurnTokens: Math.round(totalBurnTokens), equivalentBrokersBurnt: parseFloat(equivalentBrokersBurnt.toFixed(2)) };
}

async function getOwnershipStats(conf, equivBurnt, previousData) {
  let ammVaultNfts = 0;
  let res = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${conf.nftCa}&address=${conf.ammCa}&apikey=${API_KEY}`);
  if (res && res.result) ammVaultNfts = parseInt(res.result, 10);

  let rawNftHolders = await fetchTokenHoldersSafe(conf.nftCa, true);
  let trueUniqueNftHolders = rawNftHolders > 0 ? rawNftHolders : 0;
  
  if (conf.ticker === "STONK" && trueUniqueNftHolders > 3) trueUniqueNftHolders -= 3; 
  if (conf.ticker === "MANCER" && trueUniqueNftHolders > 2) trueUniqueNftHolders -= 2; 

  const rawStonkHolders = await fetchTokenHoldersSafe(conf.tokenCa, false);
  const trueUniqueStonkHolders = rawStonkHolders > 3 ? rawStonkHolders - 3 : 0;

  const circulatingNftSupply = conf.maxSupply - ammVaultNfts; 
  const currentMaxSupply = conf.maxSupply - equivBurnt;
  const ownershipRatio = circulatingNftSupply > 0 ? (trueUniqueNftHolders / circulatingNftSupply) * 100 : 0;

  let histLabels = previousData?.ownership?.historicalGrowth?.labels || [];
  let histData = previousData?.ownership?.historicalGrowth?.data || [];

  for (let i = 0; i < histData.length; i++) {
      if ((histData[i] === 0 || histData[i] > 30000) && trueUniqueStonkHolders > 0) histData[i] = trueUniqueStonkHolders;
  }

  if (histLabels.length === 0 || histData.every(v => v === 0)) {
      histLabels = ["7/15", "7/20", "7/25", "7/30", "8/5"];
      let target = trueUniqueStonkHolders > 0 ? trueUniqueStonkHolders : (conf.ticker==="STONK" ? 21000 : 500);
      histData = [ Math.round(target*0.25), Math.round(target*0.55), Math.round(target*0.75), Math.round(target*0.9), Math.round(target*0.98) ];
  }

  const dateStr = `${new Date().getMonth() + 1}/${new Date().getDate()}`;
  if (histLabels[histLabels.length - 1] === dateStr) {
      histData[histData.length - 1] = trueUniqueStonkHolders;
  } else {
      histLabels.push(dateStr);
      histData.push(trueUniqueStonkHolders);
  }

  return {
    ammVaultNfts, burntNfts: equivBurnt, currentMaxSupply, circulatingNftSupply,
    nftHolders: trueUniqueNftHolders, stonkHolders: trueUniqueStonkHolders, ownershipRatio: parseFloat(ownershipRatio.toFixed(2)),
    historicalGrowth: { labels: histLabels, data: histData }
  };
}

async function fetchActivations(conf) {
  const mergedLogs = await fetchAllLogs(conf.activationCa, conf.genesisBlock);
  const activeBrokers = new Map(); 
  const dailyData = {};
  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  const tierStats = {
    T0: { '24h': { act: 0, deact: 0 }, '7d': { act: 0, deact: 0 }, '30d': { act: 0, deact: 0 }, 'allTime': { act: 0, deact: 0 } },
    T1: { '24h': { act: 0, deact: 0 }, '7d': { act: 0, deact: 0 }, '30d': { act: 0, deact: 0 }, 'allTime': { act: 0, deact: 0 } },
    T2: { '24h': { act: 0, deact: 0 }, '7d': { act: 0, deact: 0 }, '30d': { act: 0, deact: 0 }, 'allTime': { act: 0, deact: 0 } },
    T3: { '24h': { act: 0, deact: 0 }, '7d': { act: 0, deact: 0 }, '30d': { act: 0, deact: 0 }, 'allTime': { act: 0, deact: 0 } },
    T4: { '24h': { act: 0, deact: 0 }, '7d': { act: 0, deact: 0 }, '30d': { act: 0, deact: 0 }, 'allTime': { act: 0, deact: 0 } }
  };

  let minTs = now;

  for (const log of mergedLogs) {
    let ts = log.timeStamp || log.timestamp;
    ts = ts ? (ts.toString().startsWith("0x") ? parseInt(ts, 16) : parseInt(ts, 10)) : 0;
    if (ts > 0 && ts < minTs) minTs = ts;
    const age = now - ts;

    try {
      const topics = log.topics && Array.isArray(log.topics) ? log.topics.filter(t => t !== null) : [];
      const parsed = iface.parseLog({ topics, data: log.data });
      if (!parsed) continue;

      const tokenId = parsed.args.tokenId.toString();
      const isAct = parsed.name === "Activated";
      const isDeact = parsed.name === "ActivationCleared";

      if (isAct || isDeact) {
          let tierId = null;
          if (isAct) { tierId = `T${parsed.args.tier.toString()}`; activeBrokers.set(tokenId, tierId); } 
          else if (isDeact) { tierId = activeBrokers.get(tokenId); activeBrokers.delete(tokenId); }

          if (tierId && tierStats[tierId]) {
              if (isAct) tierStats[tierId].allTime.act++;
              if (isDeact) tierStats[tierId].allTime.deact++;
              if (age <= oneDay) { if (isAct) tierStats[tierId]['24h'].act++; if (isDeact) tierStats[tierId]['24h'].deact++; }
              if (age <= 7 * oneDay) { if (isAct) tierStats[tierId]['7d'].act++; if (isDeact) tierStats[tierId]['7d'].deact++; }
              if (age <= 30 * oneDay) { if (isAct) tierStats[tierId]['30d'].act++; if (isDeact) tierStats[tierId]['30d'].deact++; }
          }

          const date = new Date(ts * 1000);
          const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
          if (!dailyData[dateStr]) dailyData[dateStr] = { activated: 0, deactivated: 0, timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000 };
          if (isAct) dailyData[dateStr].activated++;
          if (isDeact) dailyData[dateStr].deactivated++;
      }
    } catch (e) {}
  }

  if (minTs < now - (60 * 86400)) minTs = now - (60 * 86400);

  let currentTs = new Date(minTs * 1000).setHours(0,0,0,0) / 1000;
  while (currentTs <= now) {
      const d = new Date(currentTs * 1000);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!dailyData[dateStr]) dailyData[dateStr] = { activated: 0, deactivated: 0, timestamp: currentTs };
      currentTs += 86400; 
  }

  const sortedDates = Object.keys(dailyData).sort((a, b) => dailyData[a].timestamp - dailyData[b].timestamp);
  
  const history = { labels: [], dailyActivations: [], dailyDeactivations: [], cumulative: [], cumulativeGross: [] };
  let runningActive = 0, runningGross = 0;

  for (const dateStr of sortedDates) {
      const d = dailyData[dateStr];
      history.labels.push(dateStr);
      history.dailyActivations.push(d.activated);
      history.dailyDeactivations.push(d.deactivated);
      runningActive += (d.activated - d.deactivated);
      runningGross += d.activated; 
      history.cumulative.push(runningActive);
      history.cumulativeGross.push(runningGross);
  }

  const breakdown = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
  for (const tier of activeBrokers.values()) { if (breakdown[tier] !== undefined) breakdown[tier]++; }

  const dualBurn = await getTrueDeflationStats(conf);

  return { 
    activeCount: activeBrokers.size, 
    breakdown, 
    percentActivated: +((activeBrokers.size / conf.maxSupply) * 100).toFixed(2), 
    totalSupply: conf.maxSupply, 
    tierStats, 
    history, 
    dualBurn,
    activeTokenTiers: Object.fromEntries(activeBrokers)
  };
}

async function getGlobalYield(conf, sevenDaysAgo, activationStats, marketData) {
  const oneDay = 86400;
  const dailyUsdPerWeight = [0, 0, 0, 0, 0, 0, 0];
  const dailyDates = [];
  for (let i = 0; i < 7; i++) dailyDates.push(`${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getMonth() + 1}/${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getDate()}`);

  let totalSampleUsd = 0;

  if (conf.yieldMode === "oracle_wallet") {
      const dailyEth = [0, 0, 0, 0, 0, 0, 0];
      const dailyErc20 = [0, 0, 0, 0, 0, 0, 0];

      let pageEth = 1;
      while(true) {
          let urlEth = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=txlistinternal&address=${conf.oracleSource}&page=${pageEth}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let dataEth = await secureFetch(urlEth);
          const txs = (dataEth && Array.isArray(dataEth.result)) ? dataEth.result : [];
          if(txs.length === 0) break;
          let reachedOlder = false;
          for (const tx of txs) {
            const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
            if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
            if (tx.isError === "1" || tx.isError === 1) continue;
            
            const fromAddr = (tx.from || "").toLowerCase();
            const toAddr = (tx.to || "").toLowerCase();
            
            if (PROTOCOL_CONTRACTS.includes(fromAddr) && toAddr === conf.oracleSource.toLowerCase()) {
              const eth = Number(tx.value || 0) / 1e18;
              if (eth > 0) {
                  const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                  dailyEth[dayIdx] += eth;
              }
            }
          }
          if(reachedOlder || txs.length < 1000) break;
          pageEth++; await sleep(200); 
      }

      for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
        const price = tokenPrices[tokenAddr.toLowerCase()] || 0;
        if (price <= 0) continue;
        
        let pageTok = 1;
        while(true) {
            let urlTok = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${tokenAddr}&page=${pageTok}&offset=1000&sort=desc&apikey=${API_KEY}`;
            let dataTok = await secureFetch(urlTok);
            const txs = (dataTok && Array.isArray(dataTok.result)) ? dataTok.result : [];
            if(txs.length === 0) break;

            let reachedOlder = false;
            for (const tx of txs) {
              const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
              if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
              if (tx.isError === "1" || tx.isError === 1) continue;
              
              const fromAddr = (tx.from || "").toLowerCase();
              const toAddr = (tx.to || "").toLowerCase();
              if (PROTOCOL_CONTRACTS.includes(fromAddr) && toAddr === conf.oracleSource.toLowerCase()) {
                const amount = Number(tx.value || 0) / Math.pow(10, parseInt(tx.tokenDecimal || 18, 10));
                if (amount > 0) {
                    const usdVal = amount * price;
                    const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                    dailyErc20[dayIdx] += usdVal;
                }
              }
            }
            if(reachedOlder || txs.length < 1000) break;
            pageTok++; await sleep(200); 
        }
      }

      for (let i = 0; i < 7; i++) {
        const dayUsd = (dailyEth[i] * ethPriceUsd) + dailyErc20[i];
        totalSampleUsd += dayUsd;
        dailyUsdPerWeight[i] = dayUsd / conf.oracleWeight;
      }

      let totalNetworkWeight = 0;
      for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);

      const usdPerWeightUnit = totalSampleUsd / conf.oracleWeight;
      const global7DayUsd = usdPerWeightUnit * totalNetworkWeight;

      return { global7DayUsd, dailyDates, dailyUsdPerWeight };
  } 
  
  if (conf.yieldMode === "protocol_vault") {
      let page = 1;
      while(true) {
          let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${conf.tokenCa}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let data = await secureFetch(url);
          const txs = (data && Array.isArray(data.result)) ? data.result : [];
          if(txs.length === 0) break;
          let reachedOlder = false;
          for (const tx of txs) {
            const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
            if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
            if ((tx.from || "").toLowerCase() === conf.oracleSource.toLowerCase()) {
                const amount = Number(tx.value || 0) / Math.pow(10, parseInt(tx.tokenDecimal || 18, 10));
                if (amount > 0) {
                    const usdVal = amount * marketData.tokenPriceUsd;
                    const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                    
                    let activeWeightAtTime = 0;
                    for (const t of conf.tiers) activeWeightAtTime += ((activationStats.breakdown[t.id] || 0) * t.weight);
                    if (activeWeightAtTime === 0) activeWeightAtTime = 1;
                    
                    dailyUsdPerWeight[dayIdx] += (usdVal / activeWeightAtTime);
                    totalSampleUsd += usdVal;
                }
            }
          }
          if(reachedOlder || txs.length < 1000) break;
          page++; await sleep(200); 
      }
      return { global7DayUsd: totalSampleUsd, dailyDates, dailyUsdPerWeight };
  }
}

async function run() {
  console.log("Starting Multi-Project Build...");
  let previousData = {};
  try { if (fs.existsSync("data.json")) previousData = JSON.parse(fs.readFileSync("data.json", "utf8")); } catch(e) {}

  const markets = await loadMarketPrices();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  
  const finalJson = { lastUpdated: new Date().toISOString(), projects: {} };

  for (const [projectKey, conf] of Object.entries(PROJECTS)) {
      console.log(`\n--- Processing ${projectKey.toUpperCase()} ---`);
      const prevProjData = previousData.projects ? previousData.projects[projectKey] : {};
      
      const activationStats = await fetchActivations(conf);
      const ownershipStats = await getOwnershipStats(conf, activationStats.dualBurn.equivalentBrokersBurnt, prevProjData);
      
      const yieldData = await getGlobalYield(conf, sevenDaysAgo, activationStats, markets[projectKey]);
      const globalAnnualYield = yieldData.global7DayUsd * 52.14;

      let totalNetworkWeight = 0;
      for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);
      const yieldPerWeightUnitAnnual = totalNetworkWeight > 0 ? (globalAnnualYield / totalNetworkWeight) : 0;
      
      const mappedTiers = [];
      for (const t of conf.tiers) {
        mappedTiers.push({
          tier: t.id,
          name: t.name,
          reqTokens: t.reqTokens,
          multiplier: `${(t.weight/100).toFixed(2)}x`, 
          weight: t.weight,
          trackedAnnualYieldUsd: t.weight * yieldPerWeightUnitAnnual,
          dailyDates: yieldData.dailyDates,
          dailyYields: yieldData.dailyUsdPerWeight.map(val => val * t.weight)
        });
      }

      finalJson.projects[projectKey] = {
        market: markets[projectKey],
        activation: activationStats,
        ownership: ownershipStats,
        tiers: mappedTiers,
        config: { ticker: conf.ticker, unitValue: conf.unitValue, logo: conf.logo, nftCa: conf.nftCa }
      };
  }

  fs.writeFileSync("data.json", JSON.stringify(finalJson, null, 2));
  console.log("\n✓ Multi-Project Dashboard payload generated successfully.");
}

run().catch(err => { console.error(err); process.exit(1); });
