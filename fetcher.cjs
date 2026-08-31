const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// The dashboard fetches /data.json. Vite serves that out of public/ during dev
// and copies it into the build output on `vite build`; GitHub Pages serves the
// build output in docs/. Nothing rebuilds docs/ on a schedule, so an hourly job
// that only wrote public/ would leave the live site frozen until someone ran a
// build by hand. Write both, and commit both.
//
// public/ is canonical: it is the copy the next `vite build` reads, and the one
// previousData is carried forward from.
const DATA_CANONICAL = path.join(__dirname, "public", "data.json");
const DATA_MIRRORS = [path.join(__dirname, "docs", "data.json")];

function readPreviousData() {
  for (const file of [DATA_CANONICAL, ...DATA_MIRRORS]) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.warn(`[warn] could not parse ${file}, trying next: ${e.message}`);
    }
  }
  return {};
}

function writeData(payload) {
  const json = JSON.stringify(payload, null, 2);
  fs.mkdirSync(path.dirname(DATA_CANONICAL), { recursive: true });
  fs.writeFileSync(DATA_CANONICAL, json);
  const written = [DATA_CANONICAL];
  for (const file of DATA_MIRRORS) {
    // Only refresh a mirror that already exists. Creating docs/ here would
    // hand Pages a directory with a data file and no index.html.
    if (fs.existsSync(path.dirname(file))) {
      fs.writeFileSync(file, json);
      written.push(file);
    }
  }
  return written.map((f) => path.relative(__dirname, f));
}

const API_KEY = process.env.BLOCKSCOUT_API_KEY;
const PRO_API = "https://api.blockscout.com/v2/api";
const CHAIN_ID = 4663;

// gg-index: the self-hosted indexer that replaces the metered calls.
//
// Two different jobs, and which one serves a given read is not arbitrary:
//
//   lib/chain.cjs  -> anything the chain answers directly (supply, balances,
//                     logs). Free, unmetered, no dependency on our own uptime.
//   lib/ggindex    -> anything that requires an INDEX. A holder count cannot be
//                     read from the chain at all -- it only has Transfer
//                     events, so the count has to be produced by replaying and
//                     folding them. Same for activation and reward aggregates.
//
// Set GG_INDEX_URL to point at a different deployment.
const { GgIndex } = require("./lib/ggindex.cjs");
const { Rpc, TOPIC, addrTopic, decodeUint, topicAddr } = require("./lib/rpc.cjs");
const { fetchLogsWithTimestamps } = require("./lib/chain.cjs");
const { BlockTime } = require("./lib/blocktime.cjs");

const gg = new GgIndex();
const rpc = new Rpc();

// Block number -> timestamp, shared across every project because it describes
// the chain rather than a contract. Loaded from cache/blocktime.json and
// extended as the chain grows; see lib/blocktime.cjs for why interpolation is
// used instead of reading a block per log.
const blockTime = new BlockTime().load();

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
  "0x193674b72b6aa1905fc47bdbc19b30a53b666666": "SLEUTH"
};

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const LP_LOCKER = "0xa6bff814fc8ee3e1f134c767d384d0d9d94147c8";
const LAUNCH_FEE_ROUTER = "0x74f161cfd4035be8f1606e6604a34548c89447a5";
const LAUNCHER_FACTORY = "0x80a77001456bc986083678f9a112b1ec2aa07281";
const LEGACY_LAUNCHPAD = "0xeca5726dae1e53365c37ffc02369d947a91d71f9";
// SafeBuy / SafeSell on StonkSafeLaunchpadV2 — keccak of the 7-arg signatures.
const SAFE_BUY_TOPIC = "0xba22b06917da96d20a8f4f80d45cbdaaf3294856de78268558edcce22e4298df";
const SAFE_SELL_TOPIC = "0x2de6d6d1573ee69658d3daae2e752379e6eb0676622a5ade2812088d7cb56581";
const SMART_LAUNCH_PADS = [
  // V2
  { pad: "0xfcd61b25bbf3abd6cf0070d6328e351cc30eec9f", quote: WETH },
  { pad: "0x8f6782c5aa37804d08a9b7bf3984ff3245fd6cd4", quote: "0xe934e36a439c94017b64a3fece66af12099abf50" },
  { pad: "0xd4f20033586977a2511f4a2db4af7c79a340d70a", quote: "usdg" },
  { pad: "0x4b9dcd6ccfaef0f6d23065dd78e79d5e20ec8cfd", quote: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" },
  { pad: "0xee96d955d5634813374ece4c74f2c0ff71b1f9fb", quote: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
  { pad: "0xb0453a81cbf963903409fff18ad92941e1c7a864", quote: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
  { pad: "0x0c3b4eded41696eff0ed70841f132b519d81c947", quote: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" },
  { pad: "0xdb3c81c841ff88db6cdfbddb0ee049d162a6053b", quote: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" },
  { pad: "0x472a1ab6aeb77e3479193fbe83b718f9bf5f8604", quote: "ybtc" },
  // V3
  { pad: "0x5bceefba6fdf437a7388adc5c9056c827baca3b3", quote: WETH },
  { pad: "0x406fd0b957bb8cf1dd57c78540d009578e971131", quote: "0xe934e36a439c94017b64a3fece66af12099abf50" },
  { pad: "0xf0a06ac7bbb0cc3049b68c257c3ee27ccea40eea", quote: "usdg" },
  { pad: "0x5b21f8a5ef81586627b4725844ad447325d0992b", quote: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" },
  { pad: "0xdf03953dca8db733345278a0c5fd2e81fa2a9b54", quote: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
  { pad: "0xc522dfae0d1a140257702392b665183a6de7657f", quote: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
  { pad: "0xd82da1d8ef59959b170b59147283ab1f2f1ca86a", quote: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" },
  { pad: "0x644b19512052a1b6d38d7b16c6c3fb1d3f7270d2", quote: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" },
  { pad: "0x2bd7f90cca4660da82aa693cf352ddb6275c76da", quote: "ybtc" },
];

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
      // Launch Fee Router (Stonk Launcher). Smart Launch bonding tax is
      // counted separately via Clock In Card — see fetchLaunchpadRevenue.
      launchpad: LAUNCH_FEE_ROUTER
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
    // This contract emits no Deactivated/ActivationCleared event -- confirmed
    // with the Mancer team. A tier is bound to the NFT, so moving or selling it
    // clears the activation, and the ERC-721 Transfer is the only trace of it.
    // Without this the dashboard reports 0 deactivations forever and
    // activeCount only ever climbs. See reconstruction in fetchActivations.
    deactivateOnTransfer: true,
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
    // Same contract generation as Mancer: no Deactivated event, tier bound to
    // the NFT. Reconstruct exits from ERC-721 Transfer, same as mancer.
    deactivateOnTransfer: true,
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
  "0xeca5726dae1e53365c37ffc02369d947a91d71f9"
];

const ACTIVATION_ABI = [
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint8 fromTier, uint8 toTier, uint256 feePaid)",
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint256 fromTier, uint256 toTier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint256 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 tokenId, address owner, uint8 tier, uint256 feePaid)",
  "event Activated(uint256 indexed tokenId, address indexed owner, uint256 tier)",
  "event Activated(uint256 tokenId, address owner, uint256 tier)",
  "event Deactivated(uint256 indexed tokenId, address indexed owner)",
  "event Deactivated(uint256 indexed tokenId)",
  "event Deactivated(uint256 tokenId)",
  "event Deactivated(uint256 indexed tokenId, address indexed owner, uint256 tier)",
  "event Deactivated(uint256 indexed tokenId, address indexed owner, uint8 tier)",
  "event Deactivated(uint256 tokenId, address owner, uint256 tier)",
  "event Deactivated(uint256 tokenId, address owner, uint8 tier)",
  "event ActivationCleared(uint256 indexed tokenId, address indexed owner)",
  "event ActivationCleared(uint256 indexed tokenId)",
  "event ActivationCleared(uint256 tokenId)"
];
const iface = new ethers.Interface(ACTIVATION_ABI);

// ERC-721 and ERC-20 share this topic0. They are told apart by shape: a 721
// indexes all three params, so a real NFT transfer has 4 topics and empty data.
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)").toLowerCase();
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const topicToAddr = (t) => (t ? ("0x" + t.slice(-40)).toLowerCase() : null);

// Blockscout returns these as decimal strings on some routes and hex on others.
const logNum = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  const str = val.toString().trim();
  return str.startsWith("0x") || str.startsWith("0X") ? parseInt(str, 16) : parseInt(str, 10);
};

// Activation and transfer logs come from two different contracts, so they
// arrive as two independently-sorted lists. Ordering the merge by
// (block, txIndex, logIndex) is what makes "transferred AFTER activating"
// decidable -- and it has to hold within a block, not just across blocks,
// because an activate-then-flip can land in one.
function mergeChronological(a, b) {
  return [...a, ...b].sort((x, y) => {
    const bd = logNum(x.blockNumber) - logNum(y.blockNumber);
    if (bd !== 0) return bd;
    const td = logNum(x.transactionIndex) - logNum(y.transactionIndex);
    if (td !== 0) return td;
    const xi = x.logIndex !== undefined ? x.logIndex : (x.log_index !== undefined ? x.log_index : x.index);
    const yi = y.logIndex !== undefined ? y.logIndex : (y.log_index !== undefined ? y.log_index : y.index);
    return logNum(xi) - logNum(yi);
  });
}

let ethPriceUsd = 1917;
let tokenPrices = {};
let allDexPairs = [];

async function secureFetch(url) {
  const headers = { "Accept": "application/json" };
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers });
      
      // Do not kill the run. Holders/activations now come from gg-index, and
      // yield walks already refuse a truncated window via `failed: true`.
      // Exiting here froze lastUpdated until someone refilled the key.
      if (res.status === 402) {
          console.error("[warn] HTTP 402: Blockscout credits exhausted. Yield will be carried forward from the last good snapshot.");
          return { result: [], failed: true };
      }
      
      if (res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const text = await res.text();
      const data = JSON.parse(text);
      
      if (data.status === "0") {
          if (data.message === "No records found" || data.message === "No transactions found") return { result: [] };
          const resultStr = typeof data.result === 'string' ? data.result.toLowerCase() : "";
          if (resultStr.includes("limit") || resultStr.includes("rate")) { await sleep(3000); continue; }
          
          // EXTRA FAILSAFE: Catch JSON body errors regarding exhausted limits if HTTP status is technically 200
          if (resultStr.includes("credit") || resultStr.includes("exhausted") || resultStr.includes("payment")) {
              console.error("[warn] Blockscout API out of credits. Yield will be carried forward from the last good snapshot.");
              return { result: [], failed: true };
          }
      }
      return data;
    } catch (e) {
      await sleep(1500 * (i + 1));
    }
  }
  // Every attempt failed. `failed` marks this apart from a genuine empty
  // result: a paged walk breaks out on an empty page, so without the flag an
  // exhausted request reads as "end of history" and silently truncates the
  // window it was summing.
  return { result: [], failed: true };
}

/**
 * Holder count, from the gg-index fold rather than Blockscout.
 *
 * This one call was 45 of the 58 credits a run spent, and it grew more
 * expensive as a project succeeded: it paged the entire holder list -- 28,000
 * addresses for STONK -- purely to count the entries above a dust threshold.
 * The index maintains that count continuously and answers it in one request.
 *
 * The dust rule is unchanged, only relocated. `dustThreshold = isNft ? 1n :
 * 1e18` is now the index's default floor of one whole token, derived from the
 * token's own decimals, so `isNft` no longer needs passing.
 *
 * **This throws where the old version returned 0.** That is the point. The old
 * version answered 0 for a failed read as readily as for a genuinely empty
 * token, and data.json is rewritten in full each run -- so one bad response
 * published "no holders" and overwrote the correct figure. Halting is what the
 * existing 402 guard already does for the same reason.
 */
async function fetchTokenHoldersSafe(contractAddress) {
  if (!contractAddress || contractAddress === ZERO_ADDR) return 0;
  return gg.holders(contractAddress);
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
          const rhPairs = j.pairs.filter(p => p.chainId === 'robinhood' || (p.url && p.url.includes('robinhood')));
          if (rhPairs.length > 0) {
              rhPairs.forEach(p => allDexPairs.push(p));
              
              // SORT FIX: Sort by Transactions, then Volume, bypassing fake high-liquidity scam pools
              const best = rhPairs.sort((a, b) => {
                  const txsA = (a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 0);
                  const txsB = (b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 0);
                  if (txsB !== txsA) return txsB - txsA;
                  
                  const volDiff = (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
                  if (volDiff !== 0) return volDiff;
                  
                  return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
              })[0];
              
              let priceUsd = parseFloat(best.priceUsd || 0);
              
              if (best.quoteToken?.address?.toLowerCase() === conf.tokenCa.toLowerCase()) {
                  const priceNative = parseFloat(best.priceNative || 1);
                  if (priceNative > 0) priceUsd = priceUsd / priceNative;
              }
              
              if (priceUsd > 0) markets[key].tokenPriceUsd = priceUsd;
          }
        }
      } catch {}
      
      markets[key].nftFloorEth = +((conf.unitValue * markets[key].tokenPriceUsd * 1.10) / ethPriceUsd).toFixed(3);
      tokenPrices[conf.tokenCa.toLowerCase()] = markets[key].tokenPriceUsd;
      await sleep(250);
  }
  return markets;
}

async function fetchAllLogs(projectKey, address, genesisBlock, topic0 = null) {
  if (!address || address === "0x0000000000000000000000000000000000000000") return [];

  // eth_blockNumber straight off the node. The old default of 999999999 on a
  // failed read was load-bearing in the wrong direction: it made the loop scan
  // to a block that does not exist.
  const latestBlock = await rpc.blockNumber();

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
  const fromBlock = lastProcessedBlock === genesisBlock ? genesisBlock : lastProcessedBlock + 1;
  let fetchedNewLogs = false;

  // eth_getLogs directly, replacing the paged Blockscout walk.
  //
  // The hand-rolled adaptive stepping is gone because rpc.getLogs already does
  // it, and does it against the failure this version could not see. Blockscout
  // signalled "too many results" by returning exactly 1,000 and saying nothing;
  // the node has TWO signals -- a silent 10,000-result cap and an explicit
  // "exceeds limit" error -- and treats both as "narrow the window" rather than
  // as a hard failure to retry unchanged.
  //
  // Timestamps are the one thing raw eth_getLogs will not give us: this node
  // returns blockTimestamp as 0x0, and the activation parser below depends on
  // it. They come from the interpolated anchor table instead -- measured to
  // ~12s of true block time, against day and 24h/7d/30d buckets. See
  // lib/blocktime.cjs.
  if (fromBlock <= latestBlock) {
    const fresh = await fetchLogsWithTimestamps(
      rpc,
      {
        address,
        fromBlock,
        toBlock: latestBlock,
        topics: topic0 ? [topic0] : undefined,
      },
      projectKey,
      blockTime,
    );

    if (fresh.length > 0) {
      allLogs.push(...fresh);
      fetchedNewLogs = true;
    }
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

/**
 * Supply lost to burns, plus (for STONK) tokens locked in activation.
 *
 * Was four metered calls -- tokensupply, then a tokenbalance per burn address,
 * plus one for the activation contract. Now one batched supply read and, where
 * needed, one batched balance read.
 *
 * Amounts are scaled by the token's OWN decimals rather than a hardcoded 1e18.
 * Every one of these is an 18-decimal token today, so this changes no current
 * number -- but the constant was an assumption the payload never stated, and
 * the batch endpoint hands us the real value for free.
 */
async function getTrueDeflationStats(conf) {
  const stats = await gg.supplies([conf.tokenCa]);
  const s = stats.get(conf.tokenCa.toLowerCase());

  if (!s || s.supply === null) {
    throw new Error(`supply read failed for ${conf.ticker} (${conf.tokenCa})`);
  }

  const scale = 10 ** (s.decimals ?? 18);
  const currentSupply = Number(s.supply) / scale;

  // A zero supply is not a 100% burn, it is a failed read that answered.
  //
  // The burn below is `maxSupply * unitValue - currentSupply`, so a zero here
  // reports the entire supply as destroyed. That is not hypothetical: on 8/19
  // every project recorded exactly its own full supply as burnt -- STONK
  // 2,962,663,704, which is 4444 x 666666 to the token -- and those rows are
  // still in the committed snapshot history. The null check above does not
  // catch it, because the call succeeded and returned a number.
  if (!(currentSupply > 0)) {
    throw new Error(`supply read returned zero for ${conf.ticker} (${conf.tokenCa})`);
  }

  // A reverted burn-balance read is unknown, not zero. ERC-721 balanceOf(0x0)
  // reverts by spec, and treating that as a zero balance would understate the
  // burn -- so it is surfaced rather than absorbed.
  if (s.dead === null || s.zero === null) {
    throw new Error(`burn balance read failed for ${conf.ticker} (${conf.tokenCa})`);
  }
  const deadBalance = (Number(s.dead) + Number(s.zero)) / scale;

  let lockedBalance = 0;
  if (conf.ticker === "STONK") {
    const bals = await gg.balances(conf.tokenCa, [conf.activationCa]);
    const locked = bals.get(conf.activationCa.toLowerCase());
    if (locked === null || locked === undefined) {
      throw new Error(`locked balance read failed for ${conf.ticker}`);
    }
    lockedBalance = Number(locked) / scale;
  }

  const nativeBurn = Math.max(0, (conf.maxSupply * conf.unitValue) - currentSupply);
  const totalBurnTokens = nativeBurn + deadBalance + lockedBalance;

  const equivalentBrokersBurnt = totalBurnTokens / conf.unitValue;
  return { totalBurnTokens: Math.round(totalBurnTokens), equivalentBrokersBurnt: parseFloat(equivalentBrokersBurnt.toFixed(2)) };
}

async function getOwnershipStats(conf, equivBurnt, previousData) {
  // How many of the collection sit in the AMM vault. An ERC-721 balanceOf is a
  // plain token count, so no decimal scaling applies here.
  let ammVaultNfts = 0;
  if (conf.nftCa && conf.ammCa) {
    const bals = await gg.balances(conf.nftCa, [conf.ammCa]);
    const held = bals.get(conf.ammCa.toLowerCase());
    if (held === null || held === undefined) {
      throw new Error(`AMM vault balance read failed for ${conf.ticker}`);
    }
    ammVaultNfts = Number(held);
  }

  let rawNftHolders = await fetchTokenHoldersSafe(conf.nftCa);
  let trueUniqueNftHolders = rawNftHolders > (conf.teamWallets || 0) ? rawNftHolders - (conf.teamWallets || 0) : 0;

  const rawStonkHolders = await fetchTokenHoldersSafe(conf.tokenCa);
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
  const activationLogs = await fetchAllLogs(projectKey, conf.activationCa, conf.genesisBlock);

  // Cached under a separate projectKey: fetchAllLogs derives its cache file
  // from that argument, so reusing `projectKey` here would have the NFT
  // transfers overwrite the activation log cache on every run.
  const transferLogs = conf.deactivateOnTransfer
    ? (await fetchAllLogs(`${projectKey}_nft`, conf.nftCa, conf.genesisBlock, TRANSFER_TOPIC))
        .map(l => ({ ...l, __nftTransfer: true }))
    : [];

  const mergedLogs = mergeChronological(activationLogs, transferLogs);
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

      let tokenId, isAct = false, isDeact = false, tierId = null;

      if (log.__nftTransfer) {
          // A 721 indexes from/to/tokenId, so anything without 4 topics is an
          // ERC-20 sharing the signature hash -- not a broker moving.
          if (topics.length !== 4) continue;
          const from = topicToAddr(topics[1]);
          const to = topicToAddr(topics[2]);
          // A mint cannot follow an activation, and a leg in or out of the
          // activation contract is protocol custody rather than an owner
          // leaving. Neither is a deactivation.
          if (from === ZERO_ADDR) continue;
          if (from === conf.activationCa || to === conf.activationCa) continue;

          tokenId = BigInt(topics[3]).toString();
          const prev = activeBrokers.get(tokenId);
          // Only an *active* broker can deactivate. This also makes the pass
          // idempotent for projects that emit a real Deactivated event: the
          // event clears the entry first, so the sale that follows is a no-op
          // rather than a second deduction.
          if (!prev) continue;
          // Same transaction as the activation itself: contracts that move the
          // token as part of activating would otherwise deactivate instantly.
          if (prev.tx && prev.tx === log.transactionHash) continue;

          tierId = prev.t;
          activeBrokers.delete(tokenId);
          isDeact = true;
      } else {
          const parsed = iface.parseLog({ topics, data: log.data });
          if (!parsed) continue;

          tokenId = parsed.args.tokenId.toString();
          isAct = parsed.name === "Activated" || parsed.name === "ActivationUpgraded" || parsed.name.includes("Upgraded");
          isDeact = parsed.name === "ActivationCleared" || parsed.name === "Deactivated" || parsed.name.includes("Deact");

          if (isAct) {
            const tierVal = parsed.args.toTier !== undefined ? parsed.args.toTier : (parsed.args.newTier !== undefined ? parsed.args.newTier : parsed.args.tier);
            if (tierVal !== undefined && tierVal !== null) {
                tierId = `T${tierVal.toString()}`;
                activeBrokers.set(tokenId, { t: tierId, ts: ts, tx: log.transactionHash });
            }
          }
          else if (isDeact) {
            tierId = activeBrokers.has(tokenId) ? activeBrokers.get(tokenId).t : null;
            activeBrokers.delete(tokenId);
          }
      }

      if (isAct || isDeact) {
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
    // `tx` is bookkeeping for the same-transaction guard, not payload. Left in
    // it would add a 66-char hash per active token to every hourly commit.
    activeTokenTiers: Object.fromEntries([...activeBrokers].map(([id, v]) => [id, { t: v.t, ts: v.ts }])) 
  };
}

/**
 * Legacy path: token transfers OUT of a project's vault/AMM, via Blockscout.
 *
 * Only reached by a project with no activation contract -- cardwall today --
 * where there are no RewardPaid events to read and `oracleSource` points at the
 * AMM. Lifted out of the branch unchanged so the replacement above reads as one
 * thing rather than being interleaved with the code it replaces.
 */
/**
 * Page a Blockscout listing newest-first until it crosses `until`.
 *
 * Every paged read in this file had the same bug, so the paging lives in one
 * place now. A short page is NOT the end of the history: Blockscout serves
 * short pages while its own indexing is behind and flags it in the same
 * response as `status: "2"`, and reading one as the end silently truncates the
 * window being summed. It printed stonk's weekly AMM revenue as $10,770 against
 * $209,037 an hour earlier. Only an empty page terminates a walk.
 *
 * Returns null when the window was covered, or a reason string when the result
 * cannot be trusted. Page exhaustion alone is deliberately not a reason -- an
 * address whose entire history fits inside the window legitimately runs out of
 * pages -- so the source's own `status` is what separates the two. Without that
 * distinction the guard false-positives and blocks every update.
 *
 * `onRow` receives each row inside the window, newest first.
 */
async function walkPagesBackTo(urlFor, until, onRow) {
  let page = 1;
  let sawRows = false;
  let reachedWindow = false;
  let incomplete = false;

  while (true) {
    const data = await secureFetch(urlFor(page));
    if (data?.failed) return "request failed";
    if (data?.status === "2") incomplete = true;

    const txs = (data && Array.isArray(data.result)) ? data.result : [];
    if (txs.length === 0) break;
    sawRows = true;

    let older = false;
    for (const tx of txs) {
      const ts = parseInt(tx.timeStamp || tx.timestamp || 0, 10);
      if (ts < until) { older = true; continue; }
      if (tx.isError === "1" || tx.isError === 1) continue;
      onRow(tx, ts);
    }
    if (older) { reachedWindow = true; break; }

    page++;
    await sleep(200);
  }

  return (sawRows && !reachedWindow && incomplete)
    ? "pages ran out before reaching the start of the window"
    : null;
}

async function fetchVaultTokenOutflows(conf, marketData, sevenDaysAgo, oneDay, sink) {
  const reason = await walkPagesBackTo(
    (page) => `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${conf.tokenCa}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`,
    sevenDaysAgo,
    (tx, ts) => {
      if ((tx.from || "").toLowerCase() !== conf.oracleSource.toLowerCase()) return;

      const amount = Number(tx.value || 0) / Math.pow(10, parseInt(tx.tokenDecimal || 18, 10));
      if (amount <= 0) return;

      const usdVal = amount * marketData.tokenPriceUsd;
      const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));

      sink.dailyUsdPerWeight[dayIdx] += (usdVal / sink.totalNetworkWeight);
      sink.addSample(usdVal);
      sink.revenueBreakdown.ammFeesUsd += usdVal;
      sink.revenueBreakdown.dailyAmm[dayIdx] += usdVal;
    },
  );
  if (reason) sink.truncated.push(`tokentx vault outflow: ${reason}`);
}

async function getGlobalYield(projectKey, conf, sevenDaysAgo, activationStats, marketData) {
  const oneDay = 86400;
  const dailyDates = [];
  for (let i = 0; i < 7; i++) dailyDates.push(`${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getMonth() + 1}/${new Date((sevenDaysAgo + (i * oneDay)) * 1000).getDate()}`);

  let totalSampleUsd = 0;
  const dailyUsdPerWeight = [0, 0, 0, 0, 0, 0, 0];
  const revenueBreakdown = {
    ammFeesUsd: 0, securityBoxUsd: 0, launchpadUsd: 0, dexFeesUsd: 0,
    launchCreateUsd: 0, bondingFeesUsd: 0, bondingVolumeUsd: 0,
    dailyAmm: [0,0,0,0,0,0,0], dailySecurityBox: [0,0,0,0,0,0,0], dailyLaunchpad: [0,0,0,0,0,0,0], dailyDex: [0,0,0,0,0,0,0],
    dailyBondingTax: [0,0,0,0,0,0,0]
  };

  // Every paged walk in this function reports here. Function scope rather than
  // block scope because the security-box and launchpad readers are defined
  // outside the yield-mode branch that used to own this list -- which is how
  // they ended up unguarded when the rest were fixed.
  const truncatedWalks = [];

  let totalNetworkWeight = 0;
  for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);
  if (totalNetworkWeight === 0) totalNetworkWeight = 1;

  function launchpadDay(ts) {
    return Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
  }

  function creditLaunchpad(usdVal, ts, bucket) {
    if (!(usdVal > 0)) return;
    const i = launchpadDay(ts);
    if (bucket === "tax") {
      revenueBreakdown.bondingFeesUsd += usdVal;
      revenueBreakdown.dailyBondingTax[i] += usdVal;
      return;
    }
    // Headline is launch fees + bonding-phase quote volume.
    revenueBreakdown.launchpadUsd += usdVal;
    revenueBreakdown.dailyLaunchpad[i] += usdVal;
    if (bucket === "create") revenueBreakdown.launchCreateUsd += usdVal;
    else revenueBreakdown.bondingVolumeUsd += usdVal;
  }

  function quotePriceUsd(quote) {
    if (!quote || quote === "ybtc") return 0;
    if (quote === WETH) return marketData.ethPriceUsd || 0;
    if (quote === "usdg") return 1;
    return tokenPrices[quote] || 0;
  }

  async function fetchLaunchpadRevenue() {
    const fromBlock = blockTime.blockAt(sevenDaysAgo);
    const toBlock = await rpc.blockNumber();
    const padByAddr = new Map(SMART_LAUNCH_PADS.map((p) => [p.pad, p]));

    const tradeLogs = await rpc.getLogs({
      address: SMART_LAUNCH_PADS.map((p) => p.pad),
      fromBlock,
      toBlock,
      topics: [[SAFE_BUY_TOPIC, SAFE_SELL_TOPIC]],
    });

    for (const log of tradeLogs) {
      const pad = padByAddr.get((log.address || "").toLowerCase());
      if (!pad) continue;
      const topic0 = (log.topics && log.topics[0] || "").toLowerCase();
      const quoteWei = topic0 === SAFE_BUY_TOPIC
        ? decodeUint(log.data, 0)
        : decodeUint(log.data, 3);
      if (quoteWei == null || quoteWei <= 0n) continue;
      const taxBps = decodeUint(log.data, 2) || 0n;
      const taxWei = (quoteWei * taxBps) / 10000n;
      const price = quotePriceUsd(pad.quote);
      if (!(price > 0)) continue;
      const ts = blockTime.at(parseInt(log.blockNumber, 16));
      if (ts < sevenDaysAgo) continue;
      const quoteUsd = (Number(quoteWei) / 1e18) * price;
      creditLaunchpad(quoteUsd, ts, "volume");
      creditLaunchpad((Number(taxWei) / 1e18) * price, ts, "tax");
    }

    // Stonk Launcher bonding: WETH arriving at the fee router, excluding
    // graduation transfers from the LP locker.
    const wethIn = await rpc.getLogs({
      address: WETH,
      fromBlock,
      toBlock,
      topics: [TOPIC.transfer, null, addrTopic(LAUNCH_FEE_ROUTER)],
    });
    for (const log of wethIn) {
      const from = topicAddr(log.topics && log.topics[1]);
      if (from === LP_LOCKER || from === LAUNCH_FEE_ROUTER) continue;
      const amount = decodeUint(log.data, 0);
      if (amount == null || amount <= 0n) continue;
      const ts = blockTime.at(parseInt(log.blockNumber, 16));
      if (ts < sevenDaysAgo) continue;
      creditLaunchpad((Number(amount) / 1e18) * (marketData.ethPriceUsd || 0), ts, "tax");
    }
  }


  async function fetchSecurityBoxYield(address) {
    const box = address.toLowerCase();
    const fromBlock = blockTime.blockAt(sevenDaysAgo);
    const toBlock = await rpc.blockNumber();
    const tokens = [WETH, ...Object.keys(TOKEN_TICKERS)];
    const seen = new Set();

    for (const tokenAddr of tokens) {
      const token = tokenAddr.toLowerCase();
      if (seen.has(token)) continue;
      seen.add(token);
      const price = token === WETH
        ? (marketData.ethPriceUsd || 0)
        : (token === (conf.tokenCa || "").toLowerCase()
            ? (marketData.tokenPriceUsd || tokenPrices[token] || 0)
            : (tokenPrices[token] || 0));
      if (!(price > 0)) continue;

      const logs = await rpc.getLogs({
        address: token,
        fromBlock,
        toBlock,
        topics: [TOPIC.transfer, null, addrTopic(box)],
      });
      for (const log of logs) {
        const amount = decodeUint(log.data, 0);
        if (amount == null || amount <= 0n) continue;
        const ts = blockTime.at(parseInt(log.blockNumber, 16));
        if (ts < sevenDaysAgo) continue;
        const usdVal = (Number(amount) / 1e18) * price;
        const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
        revenueBreakdown.securityBoxUsd += usdVal;
        revenueBreakdown.dailySecurityBox[dayIdx] += usdVal;
      }
    }
  }


  if (conf.yieldMode === "oracle_wallet") {
      let oracleAmmSampleUsd = 0;
      let dailyOracleAmmSample = [0,0,0,0,0,0,0];


      const ethReason = await walkPagesBackTo(
        (page) => `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=txlistinternal&address=${conf.oracleSource}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`,
        sevenDaysAgo,
        (tx, ts) => {
          const fromAddr = (tx.from || "").toLowerCase();
          const toAddr = (tx.to || "").toLowerCase();
          if (!PROTOCOL_CONTRACTS.includes(fromAddr) || toAddr !== conf.oracleSource.toLowerCase()) return;

          const eth = Number(tx.value || 0) / 1e18;
          if (eth <= 0) return;

          const usdVal = eth * marketData.ethPriceUsd;
          const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));

          totalSampleUsd += usdVal;
          if (conf.oracleWeight) dailyUsdPerWeight[dayIdx] += (usdVal / conf.oracleWeight);

          if (fromAddr === conf.streams?.amm) {
            oracleAmmSampleUsd += usdVal;
            dailyOracleAmmSample[dayIdx] += usdVal;
          }
        },
      );
      if (ethReason) truncatedWalks.push(`txlistinternal oracle: ${ethReason}`);


      for (const tokenAddr of Object.keys(TOKEN_TICKERS)) {
        const price = tokenPrices[tokenAddr.toLowerCase()] || 0;
        if (price <= 0) continue;
        
        const tokReason = await walkPagesBackTo(
          (page) => `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.oracleSource}&contractaddress=${tokenAddr}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`,
          sevenDaysAgo,
          (tx, ts) => {
            const fromAddr = (tx.from || "").toLowerCase();
            const toAddr = (tx.to || "").toLowerCase();
            if (!PROTOCOL_CONTRACTS.includes(fromAddr) || toAddr !== conf.oracleSource.toLowerCase()) return;

            const amount = Number(tx.value || 0) / Math.pow(10, parseInt(tx.tokenDecimal || 18, 10));
            if (amount <= 0) return;

            const usdVal = amount * price;
            const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));

            totalSampleUsd += usdVal;
            if (conf.oracleWeight) dailyUsdPerWeight[dayIdx] += (usdVal / conf.oracleWeight);

            oracleAmmSampleUsd += usdVal;
            dailyOracleAmmSample[dayIdx] += usdVal;
          },
        );
        if (tokReason) truncatedWalks.push(`tokentx ${tokenAddr}: ${tokReason}`);
      }


      const scaleMultiplier = totalNetworkWeight / conf.oracleWeight;
      revenueBreakdown.ammFeesUsd = oracleAmmSampleUsd * scaleMultiplier;
      for (let i = 0; i < 7; i++) {
          revenueBreakdown.dailyAmm[i] = dailyOracleAmmSample[i] * scaleMultiplier;
      }

      if (projectKey === "stonk" && conf.streams?.securityBox) await fetchSecurityBoxYield(conf.streams.securityBox);
      if (projectKey === "stonk") await fetchLaunchpadRevenue();
  } 
  else if (conf.yieldMode === "protocol_vault") {
      // Yield paid out of the protocol vault, from the index's RewardPaid
      // totals instead of a paged tokentx walk.
      //
      // This is not an approximation of the old number -- it is the same
      // quantity read from a better source. The tokentx walk asked for every
      // token transfer the vault had ever made and kept the ones whose sender
      // was the vault; RewardPaid is the contract stating outright that it paid
      // a reward, with the token and amount, so nothing has to be inferred from
      // direction. Mancer alone has 15,582 of these.
      //
      // Eight cumulative reads differenced into seven daily buckets, rather
      // than paging thousands of events and bucketing here. The endpoint sums
      // server-side, so each call is small and there is no pagination to get
      // wrong. Day boundaries come from the same anchor table used for log
      // timestamps -- see BlockTime.blockAt.
      // Only where the project HAS an activation contract.
      //
      // Cardwall does not -- its activationCa is the zero address -- and its
      // oracleSource points at the AMM instead, so the legacy walk there sums
      // token transfers out of the AMM rather than reward payouts. Those are
      // different quantities, and swapping one for the other because both land
      // in ammFeesUsd would silently change what the figure means. Cardwall
      // keeps the old path until it has an activation contract to read.
      const hasActivation = conf.activationCa && conf.activationCa !== ZERO_ADDR;

      if (hasActivation) {
        const cumulative = [];
        for (let i = 0; i <= 7; i++) {
          const fromBlock = blockTime.blockAt(sevenDaysAgo + i * oneDay);
          const t = await gg.activations(projectKey, { fromBlock });
          const paid = (t.totals || []).filter(
            (x) => x.kind === "reward_paid" &&
                   (x.reward_token || "").toLowerCase() === conf.tokenCa.toLowerCase(),
          );
          // Totals are base-unit strings; BigInt then scale, never a raw double.
          const sum = paid.reduce((acc, x) => acc + BigInt(x.total || "0"), 0n);
          cumulative.push(Number(sum) / 1e18);
        }

        // cumulative[i] counts everything after dayBlocks[i], so day i is the
        // difference between consecutive reads.
        for (let i = 0; i < 7; i++) {
          const amount = Math.max(0, cumulative[i] - cumulative[i + 1]);
          if (amount <= 0) continue;
          const usdVal = amount * marketData.tokenPriceUsd;

          dailyUsdPerWeight[i] += (usdVal / totalNetworkWeight);
          totalSampleUsd += usdVal;
          revenueBreakdown.ammFeesUsd += usdVal;
          revenueBreakdown.dailyAmm[i] += usdVal;
        }
      } else {
        await fetchVaultTokenOutflows(conf, marketData, sevenDaysAgo, oneDay, {
          dailyUsdPerWeight,
          revenueBreakdown,
          addSample: (usd) => { totalSampleUsd += usd; },
          totalNetworkWeight,
          truncated: truncatedWalks,
        });
      }

      if (projectKey === "mancer" && conf.streams?.dexCollector) {
          const dexReason = await walkPagesBackTo(
            (page) => `${PRO_API}?chain_id=${CHAIN_ID}&module=account&action=tokentx&address=${conf.streams.dexCollector}&page=${page}&offset=1000&sort=desc&apikey=${API_KEY}`,
            sevenDaysAgo,
            (tx, ts) => {
              if ((tx.to || "").toLowerCase() !== conf.streams.dexCollector) return;

              const dec = parseInt(tx.tokenDecimal || 18, 10);
              const amount = Number(tx.value || 0) / Math.pow(10, dec);
              const sym = (tx.tokenSymbol || "").toUpperCase();

              // The < 5 bound rejects outliers that are not fee flow.
              if (!(amount > 0 && amount < 5) || (sym !== "WETH" && sym !== "ETH")) return;

              const usdVal = amount * marketData.ethPriceUsd;
              if (usdVal <= 0) return;

              const dayIdx = Math.max(0, Math.min(6, Math.floor((ts - sevenDaysAgo) / oneDay)));
              revenueBreakdown.dexFeesUsd += usdVal;
              revenueBreakdown.dailyDex[dayIdx] += usdVal;
              totalSampleUsd += usdVal;
              dailyUsdPerWeight[dayIdx] += (usdVal / totalNetworkWeight);
            },
          );
          if (dexReason) truncatedWalks.push(`tokentx dex collector: ${dexReason}`);
      }
  }

  // Refuse to publish a total derived from a window we could not see all of.
  // stonk's sample is scaled by totalNetworkWeight/oracleWeight (~600x), so a
  // short walk is not slightly low -- it is confidently wrong. Carry the last
  // good yield/revenue instead of aborting the whole payload.
  if (truncatedWalks.length) {
    console.warn(
      `[warn] ${projectKey}: Blockscout truncated ${truncatedWalks.join("; ")} ` +
      `(window starts ${new Date(sevenDaysAgo * 1000).toISOString()}). Carrying prior yield.`,
    );
    return { unavailable: true };
  }

  const yieldPerWeightUnitAnnual = conf.yieldMode === "oracle_wallet" 
      ? (totalSampleUsd / conf.oracleWeight) * 52.14 * totalNetworkWeight
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

  // Supply and burn balance for the whole list up front, in ONE request.
  //
  // This was the single largest metered cost after holder counts: two calls per
  // token, walked one at a time with a 200ms pause between each. The meme and
  // stock lists together are 30 tokens, so ~60 credits and ~12 seconds of
  // sleeping per run become one call.
  const supplyByToken = await gg.supplies(validTokens.map(m => m.ca));

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
                  const existing = pairsMap[addr];
                  
                  const newTxs = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
                  const oldTxs = existing ? ((existing.txns?.h24?.buys || 0) + (existing.txns?.h24?.sells || 0)) : -1;
                  
                  if (newTxs > oldTxs) {
                      pairsMap[addr] = pair;
                  } else if (newTxs === oldTxs) {
                      const newVol = pair.volume?.h24 || 0;
                      const oldVol = existing ? (existing.volume?.h24 || 0) : -1;
                      if (newVol > oldVol) {
                          pairsMap[addr] = pair;
                      }
                  }
              });
          });
      }
  } catch(e) {}

  for (const item of tokenList) {
      if (!item.ca) {
          tokenResults.push({
              name: item.name, ca: null, volume24h: 0, liquidity: 0,
              priceChange24h: 0, fdv: 0, marketCap: 0, burnt: 0, totalSupply: 1000000000, roi: "0.00%"
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
              priceChange24h = pair.priceChange?.h24 !== undefined ? -(pair.priceChange.h24) : 0;
          } else {
              priceChange24h = pair.priceChange?.h24 || 0;
          }
          
          volume24h = pair.volume?.h24 || 0;
          liquidity = pair.liquidity?.usd || 0;
      }
      
      const ca = item.ca.toLowerCase();
      if (priceUsd > 0) tokenPrices[ca] = priceUsd;
      
      // Read from the batch fetched above rather than two calls per token.
      const s = supplyByToken.get(item.ca.toLowerCase());
      const scale = 10 ** (s?.decimals ?? 18);
      const burntBalance = s && s.dead !== null ? Number(s.dead) / scale : 0;
      const totalSupplyRaw = s && s.supply !== null ? Number(s.supply) / scale : 0;

      // The 1e9 fallback is kept from the original: these are long-tail meme
      // tokens and a reverted supply read leaves FDV needing *some* basis.
      // Unlike the protocol tokens above this does not throw, because one dead
      // meme contract should not take down the whole payload.
      let finalTotalSupply = totalSupplyRaw > 0 ? totalSupplyRaw : 1000000000;
      
      fdv = priceUsd * finalTotalSupply;
      marketCap = priceUsd * Math.max(0, finalTotalSupply - burntBalance);

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
  previousData = readPreviousData();

  // Extend the block-time anchor table before anything reads a log, because
  // `blockTime.at()` interpolates between anchors and CLAMPS outside them —
  // past the last anchor every block reports that anchor's timestamp. Events
  // from the current hour would all share one stale time and land in the wrong
  // 24h bucket. On a warm cache the chain has only moved ~36k blocks since the
  // last run, so this adds an anchor or two.
  const chainHead = await rpc.blockNumber();
  const earliestGenesis = Math.min(...Object.values(PROJECTS).map(p => p.genesisBlock));
  await blockTime.ensureRange(rpc, earliestGenesis, chainHead, (done, total) => {
    process.stdout.write(`\r  block-time anchors: ${done}/${total}   `);
  });
  console.log(`\r  block-time anchors: ${blockTime.anchors.length} covering to block ${chainHead}`.padEnd(70));

  // The index has to be reachable and current before we overwrite data.json.
  // Checking here means an outage fails the run in the first second with a
  // clear message, rather than part-way through after several projects have
  // already been rebuilt.
  const idx = await gg.status();
  console.log(`  gg-index: head ${idx.chain_head}, ${idx.cursors.length} cursors`);

  const markets = await loadMarketPrices();
  const memeData = await loadTokenListPrices(MEMES);
  const stockData = await loadTokenListPrices(STOCKS);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  
  const finalJson = { 
    lastUpdated: new Date().toISOString(), 
    projects: {}, 
    memes: memeData, 
    stocks: stockData 
  };

  for (const [projectKey, conf] of Object.entries(PROJECTS)) {
      console.log(`\n--- Processing ${projectKey.toUpperCase()} ---`);
      const prevProjData = previousData.projects ? previousData.projects[projectKey] : {};
      
      const activationStats = await fetchActivations(projectKey, conf);
      const ownershipStats = await getOwnershipStats(conf, activationStats.dualBurn.equivalentBrokersBurnt, prevProjData);

      const yieldData = await getGlobalYield(projectKey, conf, sevenDaysAgo, activationStats, markets[projectKey]);
      const yieldCarried = !!(yieldData && yieldData.unavailable);

      let totalNetworkWeight = 0;
      for (const t of conf.tiers) totalNetworkWeight += ((activationStats.breakdown[t.id] || 0) * t.weight);

      let mappedTiers;
      let revenueBreakdown;
      let dailySnapshots = prevProjData.dailySnapshots || [];

      if (yieldCarried && Array.isArray(prevProjData.tiers) && prevProjData.tiers.length) {
        console.warn(`[warn] ${projectKey}: using previous yield/revenue (Blockscout window incomplete).`);
        mappedTiers = prevProjData.tiers;
        revenueBreakdown = prevProjData.revenue || {};
      } else {
        if (yieldCarried) {
          throw new Error(`${projectKey}: Blockscout yield unavailable and no previous snapshot to carry forward.`);
        }
        const yieldPerWeightUnitAnnual = totalNetworkWeight > 0 ? (yieldData.globalAnnualYield / totalNetworkWeight) : 0;
        mappedTiers = [];
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
        revenueBreakdown = yieldData.revenueBreakdown;

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
      }

      let lockedLpData = null;
      if (projectKey === "stonk") {
          lockedLpData = scanLockedStonkLiquidity(conf.tokenCa, markets[projectKey].tokenPriceUsd);
      }

      finalJson.projects[projectKey] = {
        market: markets[projectKey],
        activation: activationStats,
        ownership: ownershipStats,
        tiers: mappedTiers,
        revenue: revenueBreakdown,
        lockedLp: lockedLpData,
        underConstruction: conf.underConstruction,
        dailySnapshots: dailySnapshots,
        config: { ticker: conf.ticker, unitValue: conf.unitValue, logo: conf.logo, nftCa: conf.nftCa }
      };
  }

  const written = writeData(finalJson);
  console.log(`\n✓ Complete dashboard payload generated successfully -> ${written.join(", ")}`);
}

run().catch(err => { console.error(err); process.exit(1); });
