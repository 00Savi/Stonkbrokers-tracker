const fs = require("fs");
const { ethers } = require("ethers");

const API_KEY = process.env.BLOCKSCOUT_API_KEY;
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TOKEN_TICKERS = {
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
  "0xc72f232a6869e6cf34dc06129affd07f8a2a246a": "MANCER", 
  "0xe3fa12da7fa026b21817f16622e8ae48fa785166": "YARD",
  "0xb03058b8a39f3967df08d833682c1c99b29821b1": "WALL",
  "0x193674b72b6aa1905fc47bdbc19b30a53b666666": "SLEUTH",
  "0x6543b7746ca744c4bb2198191e71f40ff04c41b9": "DERP"
};

const MEMES = [
  { name: "StonkBroker", ca: "0xe934e36a439c94017b64a3fece66af12099abf50" },
  { name: "Yard", ca: "0xE3FA12dA7fa026B21817f16622E8AE48fA785166" },
  { name: "Mancer", ca: "0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A" },
  { name: "Wall", ca: "0xb03058b8a39f3967df08d833682c1c99b29821b1" },
  { name: "Derp", ca: "0x6543B7746ca744C4bb2198191E71f40FF04C41b9" },
  { name: "Cashcat", ca: "0x020bfC650A365f8BB26819deAAbF3E21291018b4" },
  { name: "Tendies", ca: "0x45242320DBB855EeA8Fd36804C6487E10E97FCF9" },
  { name: "Index", ca: "0x56910D4409F3a0C78C64DD8D0545FF0705389870" },
  { name: "Pipedog", ca: "0x5Cb6F181081301b44905F3ae15419112ecaBd8A6" },
  { name: "Hmm", ca: "0x7FE995a80075dF3Dc8Ae11A9b82c7FE4202CD87f" },
  { name: "Clockin", ca: null }, 
  { name: "Up", ca: "0x57C0E45cB534413D1C20A4240955d6bB250BB4F1" },
  { name: "Ai", ca: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18" },
  { name: "Frong", ca: "0x6245e67affA44a23077f0Ea7f981a8DC743a0c47" },
  { name: "Yolo", ca: "0x62C71cd34a52c30d894419CBcc55Db2aFA8032eA" },
  { name: "Wojak", ca: "0xaCE55FE98Bab14366dD49aB5AA5dF76aA11A3c6f" },
  { name: "Juggernaut", ca: "0xD7321801CAae694090694Ff55A9323139F043B88" },
  { name: "Sleuth", ca: "0x193674b72B6aA1905FC47BdbC19b30A53b666666" }
];

const STOCKS = [
  { name: "AAPL", ca: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
  { name: "AMZN", ca: "0x12f190a9f9d7d37a250758b26824b97ce941bf54" },
  { name: "NVDA", ca: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
  { name: "SLV", ca: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f" },
  { name: "MSFT", ca: "0xe93237c50d904957cf27e7b1133b510c669c2e74" },
  { name: "COST", ca: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2" },
  { name: "USAR", ca: "0xd917b029c761d264c6a312bbbcda868658ef86a6" },
  { name: "SPCX", ca: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" },
  { name: "GOOGL", ca: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3" },
  { name: "RDDT", ca: "0x05b37fb53a299a1b874a619e1c4c404d52c36f4c" },
  { name: "GME", ca: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" },
  { name: "USO", ca: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" }
];

const PROJECTS = {
  stonk: {
    genesisBlock: 12600000, 
    tokenCa: "0xe934e36a439c94017b64a3fece66af12099abf50".toLowerCase(),
    nftCa: "0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0".toLowerCase(),
    activationCa: "0xacd5ae3c060c1137fe2ee86b0ab2ef697456f664".toLowerCase(),
    ammCa: "0xe302733accf4800146e55fc45b46b4e4ffc032d2".toLowerCase(),
    maxSupply: 4444,
    unitValue: 666666,
    ticker: "STONK",
    logo: "Stonkbroker.png",
    yieldMode: "oracle_wallet",
    oracleSource: "0xe7207caa913b54aa4411e847a3a49eee0568cccf".toLowerCase(),
    oracleWeight: 333,
    underConstruction: false,
    teamWallets: 3,
    streams: {
      amm: "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9".toLowerCase(),
      securityBox: "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c".toLowerCase(),
      launchpad: "0xEcA5726dae1e53365c37fFc02369d947A91d71f9".toLowerCase()
    },
    tiers: [
      { id: "T0", name: "Floor Trader", reqTokens: 66666, weight: 100 },
      { id: "T1", name: "Analyst", reqTokens: 166666, weight: 125 },
      { id: "T2", name: "Portfolio Manager", reqTokens: 366666, weight: 160 },
      { id: "T3", name: "Managing Director", reqTokens: 666666, weight: 200 },
      { id: "T4", name: "Partner", reqTokens: 1666666, weight: 333 }
    ]
  },
  mancer: {
    genesisBlock: 29000000, 
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
    underConstruction: false,
    teamWallets: 2,
    streams: {
      dexCollector: "0x5f3b7E837f2d5b6C38E78eE4f45BD140A226656e".toLowerCase(),
      vault: "0x47c2194cAacfC778c0Baa41E10008bb7D720Cd59".toLowerCase()
    },
    tiers: [
      { id: "T0", name: "Apprentice", reqTokens: 50000, weight: 100 },
      { id: "T1", name: "Mage", reqTokens: 110000, weight: 125 },
      { id: "T2", name: "Wizard", reqTokens: 225000, weight: 160 },
      { id: "T3", name: "Elder", reqTokens: 450000, weight: 200 },
      { id: "T4", name: "Grand Mancer", reqTokens: 1200000, weight: 333 }
    ]
  },
  tickeryard: {
    genesisBlock: 33500000, 
    tokenCa: "0xE3FA12dA7fa026B21817f16622E8AE48fA785166".toLowerCase(),
    nftCa: "0x2756bffc4cccb0cbebeb675a8593ca80c8db8a97".toLowerCase(),
    activationCa: "0xEf5f726990442bC3207d72D1F9DcF8677Cf02358".toLowerCase(),
    ammCa: "0xFe0b24A3b4052aD78f10fa75a27118c3e54a00e6".toLowerCase(),
    maxSupply: 3333,
    unitValue: 300030,
    ticker: "YARD",
    logo: "Yardkeepers.png", 
    yieldMode: "protocol_vault",
    oracleSource: "0xEf5f726990442bC3207d72D1F9DcF8677Cf02358".toLowerCase(), 
    underConstruction: false, 
    teamWallets: 0,
    streams: {
      vault: "0xEf5f726990442bC3207d72D1F9DcF8677Cf02358".toLowerCase()
    },
    tiers: [
      { id: "T0", name: "Groundskeeper", reqTokens: 30003, weight: 100 },
      { id: "T1", name: "Apprentice", reqTokens: 45004.5, weight: 125 },
      { id: "T2", name: "Foreman", reqTokens: 90009, weight: 160 },
      { id: "T3", name: "Manager", reqTokens: 150015, weight: 200 },
      { id: "T4", name: "Master", reqTokens: 300030, weight: 333 }
    ]
  },
  cardwall: {
    genesisBlock: 38000000, 
    tokenCa: "0xb03058b8a39f3967df08d833682c1c99b29821b1".toLowerCase(),
    nftCa: "0x890215157dbec26d67605324271b34ba05ee9e58".toLowerCase(),
    activationCa: "0x0000000000000000000000000000000000000000",
    ammCa: "0xdd59536f394c4b589e695f5921723b89ea479379".toLowerCase(),
    maxSupply: 4444,
    unitValue: 500000,
    ticker: "WALL",
    logo: "wall.png",
    yieldMode: "protocol_vault",
    oracleSource: "0xdd59536f394c4b589e695f5921723b89ea479379".toLowerCase(),
    underConstruction: true,
    teamWallets: 0,
    streams: {},
    tiers: [
      { id: "T0", name: "1-Star Member (★)", reqTokens: 500000, weight: 100 },
      { id: "T1", name: "2-Star Member (★★)", reqTokens: 500000, weight: 125 },
      { id: "T2", name: "3-Star Member (★★★)", reqTokens: 500000, weight: 160 },
      { id: "T3", name: "4-Star Member (★★★★)", reqTokens: 500000, weight: 200 },
      { id: "T4", name: "5-Star Member (★★★★★)", reqTokens: 500000, weight: 333 }
    ]
  }
};

const PROTOCOL_CONTRACTS = [
  "0x1f12fe622c11947f93f53d63f68f7f46b6d081c9", 
  "0x55642a3f10f1af5145d3d59021b1d6b03bb8692c",
  "0xEcA5726dae1e53365c37fFc02369d947A91d71f9"
];

const ACTIVATION_ABI = [
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint8 fromTier, uint8 toTier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier)",
  "event Activated(uint256 tokenId, address owner, uint256 tier)",
  "event ActivationCleared(uint256 indexed tokenId)",
  "event ActivationCleared(uint256 tokenId)"
];
const iface = new ethers.Interface(ACTIVATION_ABI);

let ethPriceUsd = 1917;
let tokenPrices = {};
let allDexPairs = [];

async function secureFetch(url) {
  const headers = { "Accept": "application/json" };
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 402) {
          console.error("\n[FATAL API ERROR] HTTP 402: Payment Required. Key out of credits!");
          throw new Error("API_CREDITS_EXHAUSTED");
      }
      if (res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.status === "0") {
          if (data.message === "No records found" || data.message === "No transactions found") return { result: [] };
          if (typeof data.result === 'string' && data.result.toLowerCase().includes("limit")) { await sleep(3000); continue; }
      }
      return data;
    } catch (e) {
      if (e.message === "API_CREDITS_EXHAUSTED") throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`[FATAL API ERROR] Failed to fetch after 5 retries: ${url}`);
}

async function fetchTokenHoldersSafe(contractAddress, isNft = false) {
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") return 0;
  let page = 1;
  const uniqueHolders = new Set();
  const dustThreshold = isNft ? 1n : 1000000000000000000n; 

  while (true) {
    let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=token&action=getTokenHolders&contractaddress=${contractAddress}&page=${page}&offset=1000&apikey=${API_KEY}`;
    let data = await secureFetch(url);

    if (data && data.result && Array.isArray(data.result) && data.result.length > 0) {
        let newEntries = 0;
        for (const holder of data.result) {
            try {
                const bal = BigInt(holder.value || 0);
                if (bal >= dustThreshold) {
                    if (!uniqueHolders.has(holder.address)) {
                        uniqueHolders.add(holder.address);
                        newEntries++;
                    }
                }
            } catch(e) {}
        }
        if (newEntries === 0 || data.result.length < 1000) break; 
        page++;
        if (page > 50) break; 
        await sleep(200); 
    } else {
        break; 
    }
  }
  return uniqueHolders.size;
}

// HARDENED MARKET FETCHER
async function loadMarketPrices(previousData) {
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker");
    const j = await r.json();
    if (j?.price) ethPriceUsd = parseFloat(j.price);
  } catch {}

  const trustedQuotes = ["WETH", "ETH", "USDC", "USDT"];
  const markets = {};

  for (const [key, conf] of Object.entries(PROJECTS)) {
      let prevPrice = previousData?.projects?.[key]?.market?.tokenPriceUsd || 0.01;
      markets[key] = { ethPriceUsd, tokenPriceUsd: prevPrice, nftFloorEth: 0 };
      
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${conf.tokenCa}`);
        const j = await r.json();
        
        if (j?.pairs?.length) {
          const rhPairs = j.pairs.filter(p => p.chainId === 'robinhood' || (p.url && p.url.includes('robinhood')));
          
          if (rhPairs.length > 0) {
              rhPairs.forEach(p => allDexPairs.push(p));
              
              let safePairs = rhPairs.filter(p => {
                  const bSym = (p.baseToken?.symbol || "").toUpperCase();
                  const qSym = (p.quoteToken?.symbol || "").toUpperCase();
                  const liq = p.liquidity?.usd || 0;
                  return (trustedQuotes.includes(bSym) || trustedQuotes.includes(qSym)) && liq > 5000;
              });

              if (safePairs.length === 0) safePairs = rhPairs.filter(p => (p.liquidity?.usd || 0) > 100);
              if (safePairs.length === 0) safePairs = rhPairs;

              const best = safePairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
              
              let priceUsd = parseFloat(best.priceUsd || 0);
              
              // BASE/QUOTE INVERSION ENGINE
              if (best.quoteToken?.address?.toLowerCase() === conf.tokenCa.toLowerCase()) {
                  const priceNative = parseFloat(best.priceNative || 1);
                  if (priceNative > 0) priceUsd = priceUsd / priceNative;
              }

              // SANITY CLAMP
              let maxPrice = 0.50;
              if (conf.ticker === "STONK") maxPrice = 0.20;
              if (conf.ticker === "MANCER") maxPrice = 0.05;

              if (priceUsd > maxPrice) {
                  console.log(`\n[WARN] ${conf.ticker} price ($${priceUsd}) anomalous. Clamping...`);
                  if (prevPrice > maxPrice || prevPrice === 0) {
                      priceUsd = conf.ticker === "STONK" ? 0.022 : (conf.ticker === "MANCER" ? 0.0014 : 0.01);
                  } else {
                      priceUsd = prevPrice;
                  }
              }

              markets[key].tokenPriceUsd = priceUsd;
              console.log(`[PRICE] ${conf.ticker}: $${priceUsd.toFixed(5)} | Pair: ${best.pairAddress} (${best.baseToken?.symbol}/${best.quoteToken?.symbol}) | Liq: $${best.liquidity?.usd}`);
          }
        }
      } catch (e) {
          console.log(`[ERROR] Failed to fetch price for ${conf.ticker}, using fallback.`);
      }
      
      markets[key].nftFloorEth = +((conf.unitValue * markets[key].tokenPriceUsd * 1.10) / ethPriceUsd).toFixed(3);
      tokenPrices[conf.tokenCa.toLowerCase()] = markets[key].tokenPriceUsd;
      await sleep(250);
  }
  return markets;
}

// ADAPTIVE LOG FETCHER
async function fetchAllLogs(projectKey, address, genesisBlock, topic0 = null) {
  if (!address || address === "0x0000000000000000000000000000000000000000") return [];

  let latestBlock = 999999999;
  try {
    const br = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=block&action=eth_block_number&apikey=${API_KEY}`);
    if (br && br.result) {
        const val = br.result.toString();
        latestBlock = val.startsWith("0x") ? parseInt(val, 16) : parseInt(val, 10);
    }
  } catch {}

  const cacheFile = `cache_${projectKey}_logs.json`;
  let cachedLogs = [];
  let lastProcessedBlock = genesisBlock;

  try {
      if (fs.existsSync(cacheFile)) {
          cachedLogs = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
          if (cachedLogs.length > 0) {
              const highestBlock = Math.max(...cachedLogs.map(l => {
                  let b = l.blockNumber;
                  return b ? (b.toString().startsWith("0x") ? parseInt(b, 16) : parseInt(b, 10)) : 0;
              }));
              if (highestBlock > lastProcessedBlock) {
                  lastProcessedBlock = highestBlock;
              }
          }
      }
  } catch (e) {}

  let allLogs = [...cachedLogs];
  let fromBlock = lastProcessedBlock === genesisBlock ? genesisBlock : lastProcessedBlock + 1; 
  let step = 500000; 
  let fetchedNewLogs = false;

  while (fromBlock <= latestBlock) {
    let toBlock = fromBlock + step;
    if (toBlock > latestBlock) toBlock = latestBlock;

    let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=logs&action=getLogs&address=${address}&fromBlock=${fromBlock}&toBlock=${toBlock}&apikey=${API_KEY}`;
    if (topic0) url += `&topic0=${topic0}`;

    let data = await secureFetch(url);
    const logs = (data && Array.isArray(data.result)) ? data.result : [];

    if (logs.length >= 1000 && step > 1) { 
        step = Math.floor(step / 2); 
        continue; 
    }

    if (logs.length > 0) {
        allLogs.push(...logs);
        fetchedNewLogs = true;
    }

    fromBlock = toBlock + 1;
    if (logs.length < 500) { step = Math.min(500000, Math.floor(step * 2)); }
    await sleep(200); 
  }

  const parseNum = (val) => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().trim();
    if (str.startsWith("0x") || str.startsWith("0X")) return parseInt(str, 16);
    return parseInt(str, 10);
  };

  const uniqueLogsMap = new Map();
  for (const log of allLogs) {
      const idxStr = log.logIndex !== undefined ? log.logIndex : (log.log_index !== undefined ? log.log_index : (log.index !== undefined ? log.index : "0"));
      const idx = parseNum(idxStr);
      uniqueLogsMap.set(log.transactionHash + "-" + idx, log); 
  }
  const uniqueLogs = Array.from(uniqueLogsMap.values());

  uniqueLogs.sort((a, b) => {
    const blockA = parseNum(a.blockNumber);
    const blockB = parseNum(b.blockNumber);
    if (blockA !== blockB) return blockA - blockB;

    const txIdxA = parseNum(a.transactionIndex);
    const txIdxB = parseNum(b.transactionIndex);
    if (txIdxA !== txIdxB) return txIdxA - txIdxB;

    const logIdxA = parseNum(a.logIndex !== undefined ? a.logIndex : (a.log_index !== undefined ? a.log_index : a.index));
    const logIdxB = parseNum(b.logIndex !== undefined ? b.logIndex : (b.log_index !== undefined ? b.log_index : a.index));
    return logIdxA - logIdxB;
  });

  if (fetchedNewLogs || !fs.existsSync(cacheFile)) {
      fs.writeFileSync(cacheFile, JSON.stringify(uniqueLogs));
  }

  return uniqueLogs;
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
  if (conf.nftCa && conf.ammCa) {
    let res = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${conf.nftCa}&address=${conf.ammCa}&apikey=${API_KEY}`);
    if (res && res.result) ammVaultNfts = parseInt(res.result, 10);
  }

  let rawNftHolders = await fetchTokenHoldersSafe(conf.nftCa, true);
  let trueUniqueNftHolders = rawNftHolders > (conf.teamWallets || 0) ? rawNftHolders - (conf.teamWallets || 0) : 0;

  const rawStonkHolders = await fetchTokenHoldersSafe(conf.tokenCa, false);
  const trueUniqueStonkHolders = rawStonkHolders > (conf.teamWallets || 0) ? rawStonkHolders - (conf.teamWallets || 0) : 0;

  const circulatingNftSupply = Math.max(0, conf.maxSupply - ammVaultNfts - Math.floor(equivBurnt)); 
  const currentMaxSupply = Math.max(0, conf.maxSupply - Math.floor(equivBurnt));
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

async function fetchActivations(projectKey, conf) {
  const mergedLogs = await fetchAllLogs(projectKey, conf.activationCa, conf.genesisBlock);
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
      const isAct = parsed.name === "Activated" || parsed.name === "ActivationUpgraded" || parsed.name.includes("Upgraded");
      const isDeact = parsed.name === "ActivationCleared";

      if (isAct || isDeact) {
          let tierId = null;
          if (isAct) { 
            const tierVal = parsed.args.toTier !== undefined ? parsed.args.toTier : (parsed.args.newTier !== undefined ? parsed.args.newTier : parsed.args.tier);
            if (tierVal !== undefined && tierVal !== null) {
                tierId = `T${tierVal.toString()}`; 
                activeBrokers.set(tokenId, { t: tierId, ts: ts }); 
            }
          } 
          else if (isDeact) { 
            tierId = activeBrokers.has(tokenId) ? activeBrokers.get(tokenId).t : null;
            activeBrokers.delete(tokenId); 
          }

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
    } catch (e) { }
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
  for (const val of activeBrokers.values()) { if (breakdown[val.t] !== undefined) breakdown[val.t]++; }

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

async function getGlobalYield(projectKey, conf, sevenDaysAgo, activationStats, marketData) {
  const oneDay = 86400;
  const dailyDates = [];
  for (let i = 0; i < 7; i++) dailyDates.push(`${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getMonth() + 1}/${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getDate()}`);

  let totalSampleUsd = 0;
  const dailyUsdPerWeight = [0, 0, 0, 0, 0, 0, 0];
  const revenueBreakdown = {
    ammFeesUsd: 0, securityBoxUsd: 0, launchpadUsd: 0, dexFeesUsd: 0,
    dailyAmm: [0,0,0,0,0,0,0], dailySecurityBox: [0,0,0,0,0,0,0], dailyLaunchpad: [0,0,0,0,0,0,0], dailyDex: [0,0,0,0,0,0,0]
  };

  let totalNetworkWeight = 0;
  for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);
  if (totalNetworkWeight === 0) totalNetworkWeight = 1;

  async function fetchDirectEthInflows(address, key, dailyKey) {
      let page = 1;
      const seenHashes = new Set();
      while(true) {
          let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=txlist&address=${address}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let data = await secureFetch(url);
          const txs = (data && Array.isArray(data.result)) ? data.result : [];
          if(txs.length === 0) break;
          
          let reachedOlder = false;
          let newEntries = 0;
          for (const tx of txs) {
              if (seenHashes.has(tx.hash)) continue;
              seenHashes.add(tx.hash);
              newEntries++;

              const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
              if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
              if (tx.isError === "1" || tx.isError === 1) continue;
              
              if ((tx.to || "").toLowerCase() === address.toLowerCase()) {
                  let usdVal = 0;
                  
                  if (key === "launchpadUsd") {
                      const eth = Number(tx.value || 0) / 1e18;
                      if (eth >= 0.099 && eth <= 0.101) {
                          usdVal = 0.1 * marketData.ethPriceUsd;
                      }
                  } else {
                      const eth = Number(tx.value || 0) / 1e18;
                      if (eth > 0) usdVal = eth * marketData.ethPriceUsd;
                  }

                  if (usdVal > 0) {
                      const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                      revenueBreakdown[key] += usdVal;
                      revenueBreakdown[dailyKey][dayIdx] += usdVal;
                  }
              }
          }
          if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
          page++; 
          if (page > 50) break;
          await sleep(200); 
      }
  }

  // DYNAMIC SECURITY BOX ALL INFLOWS
  async function fetchSecurityBoxAllInflows(address) {
      let page = 1;
      const seenHashes = new Set();
      const rawTxs = [];
      const unknownContracts = new Set();

      while(true) {
          let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${address}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let data = await secureFetch(url);
          const txs = (data && Array.isArray(data.result)) ? data.result : [];
          if(txs.length === 0) break;
          
          let reachedOlder = false;
          let newEntries = 0;
          for (const tx of txs) {
              if (seenHashes.has(tx.hash)) continue;
              seenHashes.add(tx.hash);
              newEntries++;

              const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
              if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
              
              if ((tx.to || "").toLowerCase() === address.toLowerCase()) {
                  rawTxs.push(tx);
                  const ca = (tx.contractAddress || "").toLowerCase();
                  if (ca && !tokenPrices[ca]) {
                      unknownContracts.add(ca);
                  }
              }
          }
          if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
          page++;
          if (page > 50) break;
          await sleep(200);
      }

      const unknownArr = Array.from(unknownContracts);
      for (let i = 0; i < unknownArr.length; i += 30) {
          const chunk = unknownArr.slice(i, i + 30).join(",");
          try {
              const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk}`);
              const data = await res.json();
              if (data && data.pairs) {
                  data.pairs.forEach(pair => {
                      if (pair.chainId !== 'robinhood' && !(pair.url && pair.url.includes('robinhood'))) return;
                      
                      if ((pair.liquidity?.usd || 0) >= 100) {
                          const baseAddr = pair.baseToken?.address?.toLowerCase();
                          const quoteAddr = pair.quoteToken?.address?.toLowerCase();
                          
                          [baseAddr, quoteAddr].forEach(addr => {
                              if (!addr || !unknownContracts.has(addr)) return;
                              
                              let priceUsd = parseFloat(pair.priceUsd || 0);
                              if (pair.quoteToken?.address?.toLowerCase() === addr) {
                                  const pNative = parseFloat(pair.priceNative || 1);
                                  if (pNative > 0) priceUsd = priceUsd / pNative;
                              }
                              
                              if (!tokenPrices[addr] || (pair.liquidity.usd > (tokenPrices[addr + "_liq"] || 0))) {
                                  tokenPrices[addr] = priceUsd;
                                  tokenPrices[addr + "_liq"] = pair.liquidity.usd;
                              }
                          });
                      }
                  });
              }
          } catch(e) {}
          await sleep(250);
      }

      for (const tx of rawTxs) {
          const ca = (tx.contractAddress || "").toLowerCase();
          const price = tokenPrices[ca] || 0;
          
          if (price > 0) {
              const decimals = parseInt(tx.tokenDecimal || 18, 10);
              const amount = Number(tx.value || 0) / Math.pow(10, decimals);
              const usdVal = amount * price;

              if (usdVal > 0) {
                  const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
                  const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                  revenueBreakdown.securityBoxUsd += usdVal;
                  revenueBreakdown.dailySecurityBox[dayIdx] += usdVal;
              }
          }
      }
  }

  if (conf.yieldMode === "oracle_wallet") {
      let oracleAmmSampleUsd = 0;
      let dailyOracleAmmSample = [0,0,0,0,0,0,0];

      let pageEth = 1;
      const seenEthHashes = new Set();
      while(true) {
          let urlEth = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=txlistinternal&address=${conf.oracleSource}&page=${pageEth}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let dataEth = await secureFetch(urlEth);
          const txs = (dataEth && Array.isArray(dataEth.result)) ? dataEth.result : [];
          if(txs.length === 0) break;

          let reachedOlder = false;
          let newEntries = 0;
          for (const tx of txs) {
            if (seenEthHashes.has(tx.hash)) continue;
            seenEthHashes.add(tx.hash);
            newEntries++;

            const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
            if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
            if (tx.isError === "1" || tx.isError === 1) continue;
            
            const fromAddr = (tx.from || "").toLowerCase();
            const toAddr = (tx.to || "").toLowerCase();
            
            if (PROTOCOL_CONTRACTS.includes(fromAddr) && toAddr === conf.oracleSource.toLowerCase()) {
              const eth = Number(tx.value || 0) / 1e18;
              if (eth > 0) {
                  const usdVal = eth * marketData.ethPriceUsd;
                  const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                  
                  totalSampleUsd += usdVal;
                  if (conf.oracleWeight) dailyUsdPerWeight[dayIdx] += (usdVal / conf.oracleWeight);

                  if (fromAddr === conf.streams?.amm) {
                      oracleAmmSampleUsd += usdVal;
                      dailyOracleAmmSample[dayIdx] += usdVal;
                  }
              }
            }
          }
          if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
          pageEth++; 
          if (pageEth > 50) break;
          await sleep(200); 
      }

      for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
        const price = tokenPrices[tokenAddr.toLowerCase()] || 0;
        if (price <= 0) continue;
        
        let pageTok = 1;
        const seenTokHashes = new Set();
        while(true) {
            let urlTok = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${tokenAddr}&page=${pageTok}&offset=1000&sort=desc&apikey=${API_KEY}`;
            let dataTok = await secureFetch(urlTok);
            const txs = (dataTok && Array.isArray(dataTok.result)) ? dataTok.result : [];
            if(txs.length === 0) break;

            let reachedOlder = false;
            let newEntries = 0;
            for (const tx of txs) {
              if (seenTokHashes.has(tx.hash)) continue;
              seenTokHashes.add(tx.hash);
              newEntries++;

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
                    
                    totalSampleUsd += usdVal;
                    if (conf.oracleWeight) dailyUsdPerWeight[dayIdx] += (usdVal / conf.oracleWeight);
                    
                    oracleAmmSampleUsd += usdVal;
                    dailyOracleAmmSample[dayIdx] += usdVal;
                }
              }
            }
            if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
            pageTok++; 
            if (pageTok > 50) break;
            await sleep(200); 
        }
      }

      const scaleMultiplier = totalNetworkWeight / conf.oracleWeight;
      revenueBreakdown.ammFeesUsd = oracleAmmSampleUsd * scaleMultiplier;
      for (let i = 0; i < 7; i++) {
          revenueBreakdown.dailyAmm[i] = dailyOracleAmmSample[i] * scaleMultiplier;
      }

      if (projectKey === "stonk" && conf.streams?.securityBox) {
          await fetchDirectEthInflows(conf.streams.securityBox, "securityBoxUsd", "dailySecurityBox");
          await fetchSecurityBoxAllInflows(conf.streams.securityBox);
      }
      if (projectKey === "stonk" && conf.streams?.launchpad) {
          await fetchDirectEthInflows(conf.streams.launchpad, "launchpadUsd", "dailyLaunchpad");
      }
  } 
  else if (conf.yieldMode === "protocol_vault") {
      let page = 1;
      const seenVaultHashes = new Set();
      while(true) {
          let url = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${conf.tokenCa}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`;
          let data = await secureFetch(url);
          const txs = (data && Array.isArray(data.result)) ? data.result : [];
          if(txs.length === 0) break;
          
          let reachedOlder = false;
          let newEntries = 0;
          for (const tx of txs) {
            if (seenVaultHashes.has(tx.hash)) continue;
            seenVaultHashes.add(tx.hash);
            newEntries++;

            const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
            if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
            if ((tx.from || "").toLowerCase() === conf.oracleSource.toLowerCase()) {
                const amount = Number(tx.value || 0) / Math.pow(10, parseInt(tx.tokenDecimal || 18, 10));
                if (amount > 0) {
                    const usdVal = amount * marketData.tokenPriceUsd;
                    const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                    
                    dailyUsdPerWeight[dayIdx] += (usdVal / totalNetworkWeight);
                    totalSampleUsd += usdVal;
                    revenueBreakdown.ammFeesUsd += usdVal; 
                    revenueBreakdown.dailyAmm[dayIdx] += usdVal;
                }
            }
          }
          if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
          page++; 
          if (page > 50) break;
          await sleep(200); 
      }

      if (projectKey === "mancer" && conf.streams?.dexCollector) {
          let pageDex = 1;
          const seenDexHashes = new Set();
          while(true) {
              let urlDex = `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.streams.dexCollector}&page=${pageDex}&offset=1000&sort=desc&apikey=${API_KEY}`;
              let dataDex = await secureFetch(urlDex);
              const txs = (dataDex && Array.isArray(dataDex.result)) ? dataDex.result : [];
              if(txs.length === 0) break;
              
              let reachedOlder = false;
              let newEntries = 0;
              for (const tx of txs) {
                  if (seenDexHashes.has(tx.hash)) continue;
                  seenDexHashes.add(tx.hash);
                  newEntries++;

                  const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
                  if (ts < sevenDaysAgo) { reachedOlder = true; continue; }
                  
                  if ((tx.to || "").toLowerCase() === conf.streams.dexCollector) {
                      const dec = parseInt(tx.tokenDecimal || 18, 10);
                      const amount = Number(tx.value || 0) / Math.pow(10, dec);
                      const sym = (tx.tokenSymbol || "").toUpperCase();
                      
                      if (amount > 0 && amount < 5 && (sym === "WETH" || sym === "ETH")) {
                          const usdVal = amount * marketData.ethPriceUsd;
                          if (usdVal > 0) {
                              const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
                              revenueBreakdown.dexFeesUsd += usdVal;
                              revenueBreakdown.dailyDex[dayIdx] += usdVal;
                              totalSampleUsd += usdVal;

                              dailyUsdPerWeight[dayIdx] += (usdVal / totalNetworkWeight);
                          }
                      }
                  }
              }
              if(reachedOlder || newEntries === 0 || txs.length < 1000) break;
              pageDex++; 
              if (pageDex > 50) break;
              await sleep(200); 
          }
      }
  }

  let finalNetworkWeight = 0;
  for (const t of conf.tiers) finalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);
  if (finalNetworkWeight === 0) finalNetworkWeight = 1;

  const yieldPerWeightUnitAnnual = conf.yieldMode === "oracle_wallet" 
      ? (totalSampleUsd / conf.oracleWeight) * 52.14 * finalNetworkWeight
      : totalSampleUsd * 52.14;

  return { 
      globalAnnualYield: yieldPerWeightUnitAnnual, 
      dailyDates, 
      dailyUsdPerWeight, 
      revenueBreakdown 
  };
}

function scanLockedStonkLiquidity(stonkCa, tokenPriceUsd) {
  const uniqueLps = new Map();
  let totalStonkLocked = 0;
  let totalLpUsd = 0;

  for (const pair of allDexPairs) {
      if (pair.chainId !== 'robinhood' && !(pair.url && pair.url.includes('robinhood'))) continue;
      const pairAddress = (pair.pairAddress || "").toLowerCase();
      if (!pairAddress || uniqueLps.has(pairAddress)) continue;

      const isBase = pair.baseToken?.address?.toLowerCase() === stonkCa;
      const isQuote = pair.quoteToken?.address?.toLowerCase() === stonkCa;

      if (isBase || isQuote) {
          const pairLiquidityUsd = pair.liquidity?.usd || 0;
          if (pairLiquidityUsd <= 0) continue;

          const stonkSideUsd = pairLiquidityUsd / 2;
          const stonkCount = tokenPriceUsd > 0 ? stonkSideUsd / tokenPriceUsd : 0;

          totalStonkLocked += stonkCount;
          totalLpUsd += pairLiquidityUsd;

          uniqueLps.set(pairAddress, {
              pairName: `${pair.baseToken?.symbol || '?'}/${pair.quoteToken?.symbol || '?'}`,
              dex: pair.dexId || "DEX",
              liquidityUsd: Math.round(pairLiquidityUsd),
              stonkAmount: Math.round(stonkCount)
          });
      }
  }

  return {
      totalStonkLocked: Math.round(totalStonkLocked),
      totalLpUsd: Math.round(totalLpUsd),
      pools: Array.from(uniqueLps.values()).sort((a, b) => b.liquidityUsd - a.liquidityUsd)
  };
}

async function loadTokenListPrices(tokenList) {
  const tokenResults = [];
  const validTokens = tokenList.filter(m => m.ca !== null);
  const addresses = validTokens.map(m => m.ca).join(",");
  
  let pairsMap = {};
  try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses}`);
      const data = await res.json();
      if (data && data.pairs) {
          data.pairs.forEach(pair => {
              if (pair.chainId !== 'robinhood' && !(pair.url && pair.url.includes('robinhood'))) return;
              allDexPairs.push(pair);
              const b = pair.baseToken?.address?.toLowerCase();
              const q = pair.quoteToken?.address?.toLowerCase();
              
              [b, q].forEach(addr => {
                  if (!addr) return;
                  if (!pairsMap[addr] || (pair.liquidity?.usd || 0) > (pairsMap[addr].liquidity?.usd || 0)) {
                      pairsMap[addr] = pair;
                  }
              });
          });
      }
  } catch(e) {}

  for (const item of tokenList) {
      if (!item.ca) {
          tokenResults.push({
              name: item.name,
              ca: null,
              volume24h: 0,
              liquidity: 0,
              priceChange24h: 0,
              fdv: 0,
              marketCap: 0,
              burnt: 0,
              totalSupply: 1000000000,
              roi: "0.00%"
          });
          continue;
      }

      const pair = pairsMap[item.ca.toLowerCase()];
      let priceUsd = 0, volume24h = 0, liquidity = 0, priceChange24h = 0, fdv = 0, marketCap = 0;

      if (pair) {
          priceUsd = parseFloat(pair.priceUsd || 0);
          if (pair.quoteToken?.address?.toLowerCase() === item.ca.toLowerCase()) {
              const pNative = parseFloat(pair.priceNative || 1);
              if (pNative > 0) priceUsd = priceUsd / pNative;
          }
          volume24h = pair.volume?.h24 || 0;
          liquidity = pair.liquidity?.usd || 0;
          priceChange24h = pair.priceChange?.h24 || 0;
          fdv = pair.fdv || 0;
          marketCap = pair.marketCap || fdv;
      }
      
      // Store in global dictionary for yield calculation
      if (priceUsd > 0) {
          tokenPrices[item.ca.toLowerCase()] = priceUsd;
      }

      let burntBalance = 0;
      let totalSupplyRaw = 0;

      try {
          const burnRes = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokenbalance&contractaddress=${item.ca}&address=0x000000000000000000000000000000000000dead&apikey=${API_KEY}`);
          if (burnRes && burnRes.result) burntBalance = Number(burnRes.result) / 1e18;
      } catch(e) {}
      
      await sleep(200);

      try {
          const supplyRes = await secureFetch(`${PRO_API}?chain_id=${CHAIN_ID}&module=stats&action=tokensupply&contractaddress=${item.ca}&apikey=${API_KEY}`);
          if (supplyRes && supplyRes.result) totalSupplyRaw = Number(supplyRes.result) / 1e18;
      } catch(e) {}

      await sleep(200);
      let finalTotalSupply = totalSupplyRaw > 0 ? totalSupplyRaw : 1000000000;

      tokenResults.push({
          name: item.name,
          ca: item.ca,
          volume24h,
          liquidity,
          priceChange24h,
          fdv,
          marketCap,
          burnt: Math.round(burntBalance),
          totalSupply: Math.round(finalTotalSupply),
          roi: "0.00%"
      });
  }
  return tokenResults;
}

async function run() {
  console.log("Starting Multi-Project Build...");
  let previousData = {};
  try { if (fs.existsSync("data.json")) previousData = JSON.parse(fs.readFileSync("data.json", "utf8")); } catch(e) {}

  // 1. Fetch token and stock prices first to populate global dictionary
  const memeData = await loadTokenListPrices(MEMES);
  const stockData = await loadTokenListPrices(STOCKS);
  const markets = await loadMarketPrices(previousData);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  
  const finalJson = { 
    lastUpdated: new Date().toISOString(), 
    projects: {}, 
    memes: memeData, 
    stocks: stockData 
  };

  try {
      for (const [projectKey, conf] of Object.entries(PROJECTS)) {
          console.log(`\n--- Processing ${projectKey.toUpperCase()} ---`);
          const prevProjData = previousData.projects ? previousData.projects[projectKey] : {};
          
          const activationStats = await fetchActivations(projectKey, conf);
          const ownershipStats = await getOwnershipStats(conf, activationStats.dualBurn.equivalentBrokersBurnt, prevProjData);
          
          const yieldData = await getGlobalYield(projectKey, conf, sevenDaysAgo, activationStats, markets[projectKey]);

          let totalNetworkWeight = 0;
          for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);
          
          const yieldPerWeightUnitAnnual = totalNetworkWeight > 0 ? (yieldData.globalAnnualYield / totalNetworkWeight) : 0;
          
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

          let lockedLpData = null;
          if (projectKey === "stonk") {
              lockedLpData = scanLockedStonkLiquidity(conf.tokenCa, markets[projectKey].tokenPriceUsd);
          }

          let dailySnapshots = prevProjData.dailySnapshots || [];
          const todayStr = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
          const floorCostUsd = markets[projectKey].nftFloorEth * markets[projectKey].ethPriceUsd;

          const currentSnapshot = {
              date: todayStr,
              timestamp: Date.now(),
              tokenPriceUsd: markets[projectKey].tokenPriceUsd,
              totalBurn: (activationStats.dualBurn || {}).totalBurnTokens || 0,
              tiers: mappedTiers.map(t => {
                  const actCost = t.reqTokens * markets[projectKey].tokenPriceUsd;
                  const totalCost = floorCostUsd + actCost;
                  const roi = totalCost > 0 ? (t.trackedAnnualYieldUsd / totalCost) * 100 : 0;
                  return { tier: t.tier, roi: roi, yieldUsd: t.trackedAnnualYieldUsd };
              })
          };

          if (dailySnapshots.length > 0 && dailySnapshots[dailySnapshots.length - 1].date === todayStr) {
              dailySnapshots[dailySnapshots.length - 1] = currentSnapshot;
          } else {
              dailySnapshots.push(currentSnapshot);
          }
          if (dailySnapshots.length > 90) dailySnapshots.shift();

          finalJson.projects[projectKey] = {
            market: markets[projectKey],
            activation: activationStats,
            ownership: ownershipStats,
            tiers: mappedTiers,
            revenue: yieldData.revenueBreakdown,
            lockedLp: lockedLpData,
            underConstruction: conf.underConstruction,
            dailySnapshots: dailySnapshots,
            config: { ticker: conf.ticker, unitValue: conf.unitValue, logo: conf.logo, nftCa: conf.nftCa }
          };
      }

      fs.writeFileSync("data.json", JSON.stringify(finalJson, null, 2));
      console.log("\n✓ Complete dashboard payload generated successfully.");
  } catch (err) {
      console.error("\n[ABORT] Run failed. data.json will NOT be overwritten.");
      console.error(err.message);
      process.exit(1);
  }
}

run();
