// The Night: daily VRF strike over the four Nightshades factions.
//
// First strike (night 1) is
// https://robinhoodchain.blockscout.com/tx/0x231421da3c994c5ebe841e4164dbea7bcac09dea75461203c5e95432d6e98de4
// — owner injected the VRF seed into the engine, which split Watchers+Ghosts
// vs Knights+Zombies. The bot then pulled Uniswap v4 LP on the struck side
// through PoolManager and sold those tokens for WETH.
//
// CAs were unknown until that tx. Engine 0x999bF370…, vault() 0xfff71672…,
// CCIP router (VRF path) 0x06fC836c…, PoolManager 0x8366a39C….
//
// That vault is also the next-night deployer. The Uniswap v4 hook
// (0x065388FA…) takes swap tax into it. Two unlabeled uint256 getters on the
// vault always sum to its WETH balance: 0x2c41b11f is the smaller bucket and
// tracks fees accrued since the last sunrise; 0x4e8ad222 is leftover inventory.
// Faction LP lives in Uniswap v4 (protocol-owned). The engine's moveBps (20%)
// is how much of a struck pair the Night can pull.

const { decodeUint, decodeAddr } = require("./rpc.cjs");
const { balancesOf } = require("./chain.cjs");

const NIGHT_ENGINE = "0x999bf370f09fc776056a99bc532d0650517d8c72";
const NIGHT_VAULT = "0xfff716727d7e80e29eab5d3498b7f28431e65c58";
const NIGHT_CCIP_ROUTER = "0x06fc836cf9839b1cd891c440a0a45242da6ae1c9";
const NIGHT_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NIGHT_BOT = "0xca9a3c0655a991f79050b769e1b8985f5b65c6d2";
const NIGHT_HOOK = "0x065388fa59505cef471529ffa08d7ecfab1faacc";
const NIGHT_GENESIS = 62553796;
const FIRST_STRIKE_TX = "0x231421da3c994c5ebe841e4164dbea7bcac09dea75461203c5e95432d6e98de4";

const SEL = {
  vault: "0xfbfa77cf",
  bot: "0x10814c37",
  status: "0x886af939",
  sides: "0x0c0c4a07",
  interval: "0xfc9fefb0",
  duration: "0xc1cff4e4",
  sunriseBps: "0xbec2588b",
  moveBps: "0xd03172af",
  keepBps: "0xf2416b4f",
  // Vault getters — unverified names; see file header.
  sunriseWeth: "0x2c41b11f",
  reserveWeth: "0x4e8ad222",
};

const TOPIC = {
  // startNight() → (uint40 startedAt, uint40 endsAt)
  started: "0x9c42c391e2f127e870de412305f3809527675a527b74644c7b0db07195f1303d",
  // commitStrike(uint64,bytes32) / VRF callback
  // (uint64 indexed nightId, bytes32 seed, bytes32[] favored, bytes32[] struck, uint8 salt, uint16 magnitudeBps)
  struck: "0x221f2cffdc73c9c2506026679f041af3e34f77be11471e999b9bc1f3aee56789",
  // settleNight() → (uint64 indexed nightId, …)
  settled: "0x995e8cdd0b8c201b40ec493b763b08e135c7500654bb3038389b1df0d8491b0e",
};

const FACTION_BY_TICKER = {
  GHOSTS: "ghosts",
  ZOMBIES: "zombies",
  KNIGHTS: "knights",
  WATCHERS: "watchers",
};

const FACTION_TOKENS = {
  ghosts: "0xd6b619a75667cfcc827a3b9b75d807d98b5456d2",
  zombies: "0xe4bef9d0845a13bd39c57c7ee4463ff5d0cc20b6",
  knights: "0xb6062468073a43c79cd7fd07fbe496da9ef544c3",
  watchers: "0x4ffefdfefc16daac253140125f50d8be9baffa52",
};

const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

function wordsOf(hex) {
  const body = String(hex || "").replace(/^0x/, "");
  const out = [];
  for (let i = 0; i + 64 <= body.length; i += 64) out.push(body.slice(i, i + 64));
  return out;
}

function u256(words, i) {
  const w = words[i];
  if (!w) return 0n;
  return BigInt("0x" + w);
}

function bytes32Ascii(word) {
  if (!word) return "";
  const buf = Buffer.from(word, "hex");
  let s = "";
  for (const b of buf) {
    if (b === 0) break;
    if (b < 32 || b > 126) return "";
    s += String.fromCharCode(b);
  }
  return s;
}

function tickersToFactions(tickers) {
  return (tickers || [])
    .map((t) => FACTION_BY_TICKER[String(t).toUpperCase()])
    .filter(Boolean);
}

function readBytes32Array(words, offsetBytes) {
  const start = Number(offsetBytes) / 32;
  if (!Number.isFinite(start) || start < 0 || start >= words.length) return [];
  const len = Number(u256(words, start));
  if (!Number.isFinite(len) || len < 0 || len > 8) return [];
  const out = [];
  for (let i = 0; i < len; i++) out.push(bytes32Ascii(words[start + 1 + i]));
  return out.filter(Boolean);
}

function decodeStatus(hex) {
  const words = wordsOf(hex);
  if (words.length < 13) return null;
  const nightId = Number(u256(words, 0));
  const startedAt = Number(u256(words, 1));
  const endsAt = Number(u256(words, 2));
  const committed = u256(words, 3) !== 0n;
  const settled = u256(words, 4) !== 0n;
  const salt = Number(u256(words, 5));
  const magnitudeBps = Number(u256(words, 6));
  const sideA = tickersToFactions(readBytes32Array(words, u256(words, 11)));
  const sideB = tickersToFactions(readBytes32Array(words, u256(words, 12)));
  return {
    nightId,
    startedAt,
    endsAt,
    committed,
    settled,
    salt,
    magnitudeBps,
    sideA,
    sideB,
  };
}

function decodeSides(hex) {
  const words = wordsOf(hex);
  if (words.length < 4) return null;
  const struck = tickersToFactions(readBytes32Array(words, u256(words, 0)));
  return struck.length ? { struck } : null;
}

function logBlock(log) {
  return parseInt(log.blockNumber, 16);
}

function logTime(log, blockTime) {
  const stamped = Number(log.timeStamp);
  if (stamped > 0) return stamped;
  const block = logBlock(log);
  if (blockTime && typeof blockTime.at === "function") {
    const t = Number(blockTime.at(block));
    if (t > 0) return t;
  }
  return null;
}

async function stampHistoryLogs(rpc, logs) {
  const needed = (logs || []).filter((log) => {
    const t0 = (log.topics?.[0] || "").toLowerCase();
    return t0 === TOPIC.started || t0 === TOPIC.struck || t0 === TOPIC.settled;
  });
  const blocks = [...new Set(needed.map(logBlock))];
  if (!blocks.length) return logs;
  const ts = await rpc.blockTimestamps(blocks);
  return logs.map((log) => {
    const t = ts.get(logBlock(log));
    return t ? { ...log, timeStamp: t } : log;
  });
}

function utcDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function decodeStruckLog(log, blockTime) {
  const nightId = Number(decodeUint(log.topics?.[1] || "0x", 0) || 0n);
  const words = wordsOf(log.data);
  const row = {
    nightId,
    tx: log.transactionHash,
    block: logBlock(log),
    struckAt: logTime(log, blockTime),
  };
  if (words.length < 5) return row;
  row.seed = "0x" + words[0];
  row.favored = tickersToFactions(readBytes32Array(words, u256(words, 1)));
  row.struck = tickersToFactions(readBytes32Array(words, u256(words, 2)));
  row.salt = Number(u256(words, 3));
  row.magnitudeBps = Number(u256(words, 4));
  return row;
}

function assembleHistory(logs, blockTime) {
  const starts = [];
  const strikes = [];
  const settles = new Map();
  for (const log of logs || []) {
    const t0 = (log.topics?.[0] || "").toLowerCase();
    if (t0 === TOPIC.started) {
      const words = wordsOf(log.data);
      starts.push({
        startedAt: Number(u256(words, 0)),
        endsAt: Number(u256(words, 1)),
        startTx: log.transactionHash,
        block: logBlock(log),
      });
    } else if (t0 === TOPIC.struck) {
      strikes.push(decodeStruckLog(log, blockTime));
    } else if (t0 === TOPIC.settled) {
      const nightId = Number(decodeUint(log.topics?.[1] || "0x", 0) || 0n);
      if (nightId > 0) {
        settles.set(nightId, {
          settleTx: log.transactionHash,
          settledAt: logTime(log, blockTime),
          settleBlock: logBlock(log),
        });
      }
    }
  }
  starts.sort((a, b) => a.block - b.block);
  strikes.sort((a, b) => a.nightId - b.nightId || a.block - b.block);
  return strikes.filter((s) => s.nightId > 0).map((s, i) => {
    const start = starts[i] || {};
    const settle = settles.get(s.nightId) || {};
    const startedAt = start.startedAt || null;
    return {
      nightId: s.nightId,
      date: utcDate(startedAt || s.struckAt),
      startedAt: startedAt || null,
      endsAt: start.endsAt || null,
      struckAt: s.struckAt || null,
      settledAt: settle.settledAt || null,
      favored: s.favored || [],
      struck: s.struck || [],
      salt: s.salt ?? null,
      magnitudeBps: s.magnitudeBps ?? null,
      seed: s.seed || null,
      tx: s.tx,
      startTx: start.startTx || null,
      settleTx: settle.settleTx || null,
      block: s.block,
    };
  });
}

function mergeHistory(chainRows, prevHistory, live) {
  const prevById = new Map((prevHistory || []).map((r) => [r.nightId, r]));
  return (chainRows || []).map((row) => {
    const prev = prevById.get(row.nightId) || {};
    const current = live?.nightId === row.nightId;
    return {
      ...prev,
      ...row,
      vaultWeth: current ? live.vaultWeth : (prev.vaultWeth ?? null),
      vaultWethUsd: current ? live.vaultWethUsd : (prev.vaultWethUsd ?? null),
      vaultTokens: current ? live.vaultTokens : (prev.vaultTokens || null),
    };
  });
}

function phaseOf(status, durationSec, nowTs) {
  if (!status?.startedAt) return "idle";
  const now = nowTs || Math.floor(Date.now() / 1000);
  if (now < status.endsAt) {
    if (!status.committed) return "open";
    if (!status.settled) return "moving";
    return "settled";
  }
  const next = status.startedAt + (durationSec || 86400);
  if (now < next) return "awaiting";
  return status.settled ? "awaiting" : "idle";
}

function weiToEth(wei) {
  if (wei == null) return null;
  return Number(wei) / 1e18;
}

function usdOf(eth, ethPriceUsd) {
  return eth != null && ethPriceUsd ? eth * ethPriceUsd : null;
}

function pairTxCount(p) {
  return (p?.txns?.h24?.buys || 0) + (p?.txns?.h24?.sells || 0);
}

function bestRobinhoodPair(pairs, tokenCa) {
  const token = String(tokenCa || "").toLowerCase();
  const onChain = (pairs || []).filter((p) => {
    const chain = String(p.chainId || "").toLowerCase();
    if (chain !== "robinhood" && !(p.url && String(p.url).includes("robinhood"))) return false;
    const b = p.baseToken?.address?.toLowerCase();
    const q = p.quoteToken?.address?.toLowerCase();
    return b === token || q === token;
  });
  if (!onChain.length) return null;
  return onChain.sort((a, b) => {
    const txs = pairTxCount(b) - pairTxCount(a);
    if (txs) return txs;
    const vol = (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
    if (vol) return vol;
    return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
  })[0];
}

function pairWeth(pair) {
  if (!pair) return 0;
  const weth = WETH.toLowerCase();
  const base = pair.baseToken?.address?.toLowerCase();
  const quote = pair.quoteToken?.address?.toLowerCase();
  if (quote === weth) return Number(pair.liquidity?.quote) || 0;
  if (base === weth) return Number(pair.liquidity?.base) || 0;
  return 0;
}

async function fetchFactionPools() {
  const ids = Object.keys(FACTION_TOKENS);
  const empty = {};
  for (const id of ids) empty[id] = { weth: 0, usd: 0, pair: null };
  try {
    const addrs = ids.map((id) => FACTION_TOKENS[id]).join(",");
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
    if (!res.ok) throw new Error(`dexscreener ${res.status}`);
    const j = await res.json();
    const pairs = j.pairs || [];
    const out = {};
    for (const id of ids) {
      const p = bestRobinhoodPair(pairs, FACTION_TOKENS[id]);
      out[id] = {
        weth: pairWeth(p),
        usd: Number(p?.liquidity?.usd) || 0,
        pair: p?.pairAddress || null,
      };
    }
    return out;
  } catch (e) {
    console.warn(`[warn] night pools: ${e.message}`);
    return empty;
  }
}

function twoFactionWethRange(pools) {
  const amts = Object.keys(FACTION_TOKENS).map((id) => Number(pools[id]?.weth) || 0);
  const sorted = [...amts].sort((a, b) => a - b);
  return {
    total: amts.reduce((s, n) => s + n, 0),
    min: (sorted[0] || 0) + (sorted[1] || 0),
    max: (sorted[sorted.length - 2] || 0) + (sorted[sorted.length - 1] || 0),
  };
}

async function fetchNight(rpc, opts = {}) {
  const ethPriceUsd = Number(opts.ethPriceUsd) || 0;
  const prev = opts.prev || null;
  const fromBlock = opts.fromBlock || NIGHT_GENESIS;

  const calls = [
    { to: NIGHT_ENGINE, data: SEL.vault },
    { to: NIGHT_ENGINE, data: SEL.bot },
    { to: NIGHT_ENGINE, data: SEL.status },
    { to: NIGHT_ENGINE, data: SEL.sides },
    { to: NIGHT_ENGINE, data: SEL.interval },
    { to: NIGHT_ENGINE, data: SEL.duration },
    { to: NIGHT_ENGINE, data: SEL.sunriseBps },
    { to: NIGHT_ENGINE, data: SEL.moveBps },
    { to: NIGHT_ENGINE, data: SEL.keepBps },
    { to: NIGHT_VAULT, data: SEL.sunriseWeth },
    { to: NIGHT_VAULT, data: SEL.reserveWeth },
  ];
  const raw = await rpc.calls(calls);
  const vault = decodeAddr("0x" + (raw[0] || "").slice(-40)) || NIGHT_VAULT;
  const bot = decodeAddr("0x" + (raw[1] || "").slice(-40)) || NIGHT_BOT;
  const status = decodeStatus(raw[2]);
  if (!status) throw new Error("night status() decode failed");
  const sides = raw[3] && raw[3] !== "0x" ? decodeSides(raw[3]) : null;
  const intervalSec = Number(decodeUint(raw[4]) || 3600n);
  const durationSec = Number(decodeUint(raw[5]) || 86400n);
  const sunriseBps = Number(decodeUint(raw[6]) || 2500n);
  const moveBps = Number(decodeUint(raw[7]) || 2000n);
  const keepBps = Number(decodeUint(raw[8]) || 8000n);
  const sunriseWeth = weiToEth(decodeUint(raw[9]));
  const reserveWeth = weiToEth(decodeUint(raw[10]));

  const tokenOrder = ["ghosts", "zombies", "knights", "watchers"];
  const pairs = [
    { token: WETH, holder: vault },
    ...tokenOrder.map((id) => ({ token: FACTION_TOKENS[id], holder: vault })),
  ];
  const [bals, pools] = await Promise.all([
    balancesOf(rpc, pairs),
    fetchFactionPools(),
  ]);
  const vaultWeth = weiToEth(bals[0]);
  const vaultTokens = {};
  tokenOrder.forEach((id, i) => {
    vaultTokens[id] = weiToEth(bals[i + 1]);
  });
  if (ethPriceUsd) {
    for (const id of Object.keys(pools)) {
      pools[id].usd = (Number(pools[id].weth) || 0) * ethPriceUsd;
    }
  }
  const poolRange = twoFactionWethRange(pools);
  const moveFrac = (moveBps || 0) / 10000;
  const poolsWeth = poolRange.total;
  const moveableWeth = poolsWeth * moveFrac;
  const strikeWethMin = poolRange.min;
  const strikeWethMax = poolRange.max;
  const moveWethMin = strikeWethMin * moveFrac;
  const moveWethMax = strikeWethMax * moveFrac;

  let history = Array.isArray(prev?.history) ? prev.history : [];
  try {
    const head = await rpc.blockNumber();
    const logs = await stampHistoryLogs(rpc, await rpc.getLogs({
      address: NIGHT_ENGINE,
      fromBlock,
      toBlock: head,
    }));
    const chainRows = assembleHistory(logs, opts.blockTime);
    const liveSnap = {
      nightId: status.nightId,
      vaultWeth,
      vaultWethUsd: vaultWeth != null && ethPriceUsd ? vaultWeth * ethPriceUsd : null,
      vaultTokens,
    };
    history = mergeHistory(chainRows, prev?.history, liveSnap);
  } catch (e) {
    console.warn(`[warn] night history logs: ${e.message}`);
  }

  const lastStrike = history[history.length - 1] || null;
  const struck = (sides?.struck?.length ? sides.struck : lastStrike?.struck) || status.sideA || [];
  const favored = lastStrike?.favored?.length
    ? lastStrike.favored
    : (status.sideA || []).concat(status.sideB || []).filter((id) => !struck.includes(id));

  const nextStartsAt = status.startedAt ? status.startedAt + durationSec : 0;
  const nowTs = Math.floor(Date.now() / 1000);

  return {
    engine: NIGHT_ENGINE,
    vault,
    hook: NIGHT_HOOK,
    bot,
    ccipRouter: NIGHT_CCIP_ROUTER,
    poolManager: NIGHT_POOL_MANAGER,
    firstStrikeTx: FIRST_STRIKE_TX,
    genesisBlock: NIGHT_GENESIS,
    nightId: status.nightId,
    startedAt: status.startedAt,
    endsAt: status.endsAt,
    nextStartsAt,
    phase: phaseOf(status, durationSec, nowTs),
    committed: status.committed,
    settled: status.settled,
    salt: status.salt,
    magnitudeBps: status.magnitudeBps,
    intervalSec,
    durationSec,
    sunriseBps,
    moveBps,
    keepBps,
    favored,
    struck,
    vaultWeth,
    vaultWethUsd: usdOf(vaultWeth, ethPriceUsd),
    sunriseWeth,
    sunriseWethUsd: usdOf(sunriseWeth, ethPriceUsd),
    reserveWeth,
    reserveWethUsd: usdOf(reserveWeth, ethPriceUsd),
    vaultTokens,
    pools,
    poolsWeth,
    poolsWethUsd: usdOf(poolsWeth, ethPriceUsd),
    moveableWeth,
    moveableWethUsd: usdOf(moveableWeth, ethPriceUsd),
    strikeWethMin,
    strikeWethMax,
    moveWethMin,
    moveWethMax,
    moveWethMinUsd: usdOf(moveWethMin, ethPriceUsd),
    moveWethMaxUsd: usdOf(moveWethMax, ethPriceUsd),
    lastStrikeTx: lastStrike?.tx || FIRST_STRIKE_TX,
    history,
  };
}

module.exports = {
  NIGHT_ENGINE,
  NIGHT_VAULT,
  NIGHT_HOOK,
  NIGHT_CCIP_ROUTER,
  NIGHT_POOL_MANAGER,
  NIGHT_BOT,
  NIGHT_GENESIS,
  FIRST_STRIKE_TX,
  FACTION_TOKENS,
  fetchNight,
};
