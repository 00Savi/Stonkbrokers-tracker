// Broker Clock In 3.0 rounds.
//
// Anyone can crank the engine once the ETH pot clears the minimum. The round
// tallies each activated broker's election, swaps the pot into those assets,
// and credits seats by tier weight. RoundOpened carries the pot. TallyFinished
// carries demand per menu slot. A slot's ETH is pot * demand / sum(demand).
// Per-broker CreditAccrued logs are the delivery detail and are not walked.

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const dates = require("./dates.cjs");

const ENGINE = "0xf4129019d8838f2555bdc8ecb3024a02145dbc58";
const SITE = "https://stonkbrokers.io/clock-in";
const START_BLOCK = 65_000_000;
const CACHE_FILE = path.join(__dirname, "..", "cache", "clockin_broker.json");
const RECENT = 12;

const FACE = new ethers.Interface([
  "event RoundOpened(uint256 indexed round, uint256 potWei, uint256 totalWeight, uint32 menuVersion)",
  "event RoundFinished(uint256 indexed round, uint256 recipients)",
  "event RoundCancelled(uint256 indexed round, uint8 atPhase, uint256 atCursor)",
  "event TallyFinished(uint256 indexed round, uint256[17] demandScaled)",
  "function ethPot() view returns (uint256)",
  "function minDropWei() view returns (uint256)",
  "function currentRound() view returns (uint256)",
  "function menuVersion() view returns (uint32)",
  "function getMenu() view returns (address[])",
  "function symbol() view returns (string)",
]);

const TOPIC = [
  FACE.getEvent("RoundOpened").topicHash,
  FACE.getEvent("RoundFinished").topicHash,
  FACE.getEvent("RoundCancelled").topicHash,
  FACE.getEvent("TallyFinished").topicHash,
];

function emptyBook() {
  return {
    ok: false,
    engine: ENGINE,
    site: SITE,
    rounds: 0,
    ethDistributed: 0,
    ethPot: 0,
    minDropEth: 0,
    assets: [],
    recent: [],
  };
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!raw || typeof raw !== "object") return { cursor: 0, rounds: {}, menu: [] };
    return {
      cursor: Number(raw.cursor) || 0,
      rounds: raw.rounds && typeof raw.rounds === "object" ? raw.rounds : {},
      menu: Array.isArray(raw.menu) ? raw.menu : [],
    };
  } catch {
    return { cursor: 0, rounds: {}, menu: [] };
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

function slot(rounds, id) {
  const key = String(id);
  if (!rounds[key]) rounds[key] = { round: Number(key) };
  return rounds[key];
}

function blockOf(log) {
  const n = log.blockNumber;
  if (typeof n === "number") return n;
  return parseInt(n, 16);
}

function applyLog(rounds, parsed, blockNumber) {
  const name = parsed.name;
  const id = parsed.args.round;
  const row = slot(rounds, id);
  if (name === "RoundOpened") {
    row.potWei = parsed.args.potWei.toString();
    row.totalWeight = parsed.args.totalWeight.toString();
    row.menuVersion = Number(parsed.args.menuVersion);
    row.openedBlock = blockNumber;
  } else if (name === "RoundFinished") {
    row.recipients = Number(parsed.args.recipients);
    row.finishedBlock = blockNumber;
  } else if (name === "RoundCancelled") {
    row.cancelled = true;
  } else if (name === "TallyFinished") {
    row.demand = parsed.args.demandScaled.map((v) => v.toString());
  }
}

function weiToEth(wei) {
  const n = Number(wei);
  return Number.isFinite(n) ? n / 1e18 : 0;
}

/** ETH each menu slot received from one pot. Slots with no demand are omitted. */
function splitPot(potWei, demand) {
  const pot = BigInt(potWei || 0);
  const parts = (demand || []).map((v) => BigInt(v || 0));
  const sum = parts.reduce((acc, n) => acc + n, 0n);
  if (pot <= 0n || sum <= 0n) return [];
  return parts.map((d, i) => ({
    index: i,
    eth: d > 0n ? Number((pot * d) / sum) / 1e18 : 0,
  })).filter((row) => row.eth > 0);
}

function buildBook(cache, live, ethPriceUsd) {
  const px = Number(ethPriceUsd) || 0;
  const menu = cache.menu || [];
  const bySymbol = new Map();
  let ethDistributed = 0;
  let ethPerEngineWeight = 0;
  let counted = 0;
  const recent = [];
  const rows = Object.values(cache.rounds || {}).sort((a, b) => a.round - b.round);
  for (const row of rows) {
    if (row.cancelled || !(Number(row.recipients) > 0) || !row.potWei) continue;
    const potEth = weiToEth(row.potWei);
    if (!(potEth > 0)) continue;
    counted += 1;
    ethDistributed += potEth;
    const totalWeight = Number(row.totalWeight);
    if (totalWeight > 0) ethPerEngineWeight += potEth / totalWeight;
    const mix = splitPot(row.potWei, row.demand).map((part) => {
      const token = menu[part.index] || {};
      const symbol = token.symbol || `Slot ${part.index + 1}`;
      return {
        symbol,
        address: token.address || "",
        eth: +part.eth.toFixed(6),
        share: potEth > 0 ? +(part.eth / potEth).toFixed(4) : 0,
      };
    }).sort((a, b) => b.eth - a.eth);
    for (const part of mix) {
      const cur = bySymbol.get(part.symbol) || { symbol: part.symbol, address: part.address, eth: 0 };
      cur.eth += part.eth;
      if (part.address) cur.address = part.address;
      bySymbol.set(part.symbol, cur);
    }
    const block = row.finishedBlock || row.openedBlock;
    recent.push({
      round: row.round,
      date: block ? dates.utcIsoFromTs(live.blockTimeAt(block)) : "",
      potEth: +potEth.toFixed(6),
      recipients: row.recipients,
      top: mix[0]?.symbol || "",
      assets: mix,
    });
  }
  const assets = [...bySymbol.values()]
    .map((row) => ({
      symbol: row.symbol,
      address: row.address,
      eth: +row.eth.toFixed(6),
      usd: px > 0 ? +(row.eth * px).toFixed(2) : 0,
      share: ethDistributed > 0 ? +(row.eth / ethDistributed).toFixed(4) : 0,
    }))
    .sort((a, b) => b.eth - a.eth);
  return {
    ok: counted > 0,
    engine: ENGINE,
    site: SITE,
    rounds: counted,
    ethDistributed: +ethDistributed.toFixed(6),
    ethPerEngineWeight,
    ethUsd: px > 0 ? +(ethDistributed * px).toFixed(2) : 0,
    ethPot: weiToEth(live.ethPotWei),
    minDropEth: weiToEth(live.minDropWei),
    currentRound: live.currentRound,
    assets,
    recent: recent.slice(-RECENT).reverse(),
  };
}

async function readMenu(rpc, cache) {
  const [menuRaw, versionRaw] = await rpc.calls([
    { to: ENGINE, data: FACE.encodeFunctionData("getMenu", []) },
    { to: ENGINE, data: FACE.encodeFunctionData("menuVersion", []) },
  ]);
  let menu = [];
  let version = 0;
  try {
    menu = FACE.decodeFunctionResult("getMenu", menuRaw)[0].map((a) => String(a).toLowerCase());
    version = Number(FACE.decodeFunctionResult("menuVersion", versionRaw)[0]);
  } catch (e) {
    console.warn(`[warn] clock in menu: ${e.message}`);
    return cache.menu || [];
  }
  const same = cache.menu?.length === menu.length
    && cache.menu.every((row, i) => row.address === menu[i] && row.symbol && row.version === version);
  if (same) return cache.menu;
  const raw = await rpc.calls(menu.map((to) => ({ to, data: FACE.encodeFunctionData("symbol", []) })));
  return menu.map((address, i) => {
    let symbol = "";
    try { symbol = FACE.decodeFunctionResult("symbol", raw[i])[0]; } catch { symbol = ""; }
    return { address, symbol: symbol || address.slice(0, 6), version };
  });
}

async function fetchClockIn({ rpc, blockTime, ethPriceUsd }) {
  const head = await rpc.blockNumber();
  const cache = loadCache();
  const pull = async (from, to) => {
    if (from > to) return;
    const logs = await rpc.getLogs({
      address: ENGINE,
      fromBlock: from,
      toBlock: to,
      topics: [TOPIC],
    });
    for (const log of logs) {
      let parsed;
      try { parsed = FACE.parseLog(log); } catch { continue; }
      applyLog(cache.rounds, parsed, blockOf(log));
    }
  };
  // A cache written before the start block moved would skip the early rounds.
  const scannedFrom = Number(cache.scannedFrom) || 0;
  if (!scannedFrom || scannedFrom > START_BLOCK) {
    const prefixTo = scannedFrom ? scannedFrom - 1 : (Number(cache.cursor) || 0);
    if (prefixTo >= START_BLOCK) await pull(START_BLOCK, Math.min(prefixTo, head));
  }
  const tailFrom = Math.max((Number(cache.cursor) || 0) + 1, START_BLOCK);
  if (tailFrom <= head) await pull(tailFrom, head);
  cache.scannedFrom = START_BLOCK;
  cache.cursor = head;
  cache.menu = await readMenu(rpc, cache);
  saveCache(cache);

  const [potRaw, minRaw, curRaw] = await rpc.calls([
    { to: ENGINE, data: FACE.encodeFunctionData("ethPot", []) },
    { to: ENGINE, data: FACE.encodeFunctionData("minDropWei", []) },
    { to: ENGINE, data: FACE.encodeFunctionData("currentRound", []) },
  ]);
  const live = {
    ethPotWei: FACE.decodeFunctionResult("ethPot", potRaw)[0],
    minDropWei: FACE.decodeFunctionResult("minDropWei", minRaw)[0],
    currentRound: Number(FACE.decodeFunctionResult("currentRound", curRaw)[0]),
    blockTimeAt: (block) => blockTime.at(block),
  };
  return buildBook(cache, live, ethPriceUsd);
}

module.exports = { fetchClockIn, splitPot, ENGINE, SITE };
