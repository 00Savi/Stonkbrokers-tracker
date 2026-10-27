// The Mutual Fun. Five funds, 4,001 Seats, enrollment by share class.
//
// This is not an Anvil staking vault. A Seat is minted, dealt into one fund,
// and earns only while it is enrolled. The Front-End Load is paid in $TMF:
// half is burned, half joins that fund's book. Weight is the class multiple
// times 100, the same unit Stonk uses for a tier.

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const dates = require("./dates.cjs");

const SEATS = "0x1215d567dc4e0f2999dcc262d78d1586ff97154f";
const TOKEN = "0xc76b6020a3d7f4bb5cee85d44f8b0da6a6ee7616";
const PASS = "0xed37605ff0e513e46d50b26244deb2024189751a";
const OPEN_MARKET = "0x0959f956a13f73be944d564e301df63e3ba02047";
const DIVIDEND_OFFICE = "0xf658b4abdafc6c8d652742d563e9d9ab8b454475";
const FUND_DESK = "0xca50244f9135ed70add8d3cbd50ef6f6a76ba654";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const PRICE_POOL = "0xe71058168390371d86a9d98d73acad4758a8c06e";
const SITE = "https://themutual.fun/";
const MAX_SEATS = 4001;
const HOUSE_RATE = 401_000;
const CACHE_VERSION = 2;
const ZERO = "0x0000000000000000000000000000000000000000";
const CACHE_FILE = path.join(__dirname, "..", "cache", "mutualfun.json");
const TIER_IDS = ["T0", "T1", "T2", "T3", "T4"];

const FUNDS = [
  { id: 0, name: "Argon" },
  { id: 1, name: "Bogle" },
  { id: 2, name: "Smaug" },
  { id: 3, name: "Midas" },
  { id: 4, name: "Vladd" },
];

const CLASSES = [
  { tier: "T0", name: "Retail", load: 40_100, weight: 100, corner: 0 },
  { tier: "T1", name: "Investor", load: 100_250, weight: 150, corner: 220 },
  { tier: "T2", name: "Advisor", load: 200_500, weight: 200, corner: 330 },
  { tier: "T3", name: "Institutional", load: 401_000, weight: 250, corner: 440 },
  { tier: "T4", name: "Retirement", load: 1_002_500, weight: 333, corner: 550 },
];

const FACE = new ethers.Interface([
  "function nextSeat() view returns (uint256)",
  "function openMarket() view returns (address)",
  "function dividendOffice() view returns (address)",
  "function fundDesk() view returns (address)",
  "event SeatEnrolled(uint256 indexed tokenId, uint8 indexed fund, uint8 shareClass, uint256 load)",
  "event EnrollmentEnded(uint256 indexed tokenId)",
  "event SeatsMerged(uint256 indexed kept, uint256 indexed retired, uint8 newClass)",
  "event DividendsPosted(uint8 indexed fund, address indexed token, uint256 amount)",
  "function enrolledCount(uint8) view returns (uint256)",
  "function totalWeightAll() view returns (uint256)",
  "function navInWeth(uint8) view returns (uint256)",
  "function isOpen(uint8) view returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function ownerOf(uint256) view returns (address)",
]);

const TOPIC = [
  FACE.getEvent("SeatEnrolled").topicHash,
  FACE.getEvent("EnrollmentEnded").topicHash,
  FACE.getEvent("SeatsMerged").topicHash,
  FACE.getEvent("DividendsPosted").topicHash,
];

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    // v1 lumped every log into one lookback and did not stamp class or burn
    // by day. A version miss replays from genesis instead of trusting that.
    if (!raw || raw.v !== CACHE_VERSION) return emptyCache();
    return {
      v: CACHE_VERSION,
      cursor: Number(raw.cursor) || 0,
      enrolled: raw.enrolled && typeof raw.enrolled === "object" ? raw.enrolled : {},
      loadWei: String(raw.loadWei || "0"),
      retired: Number(raw.retired) || 0,
      dividends: raw.dividends && typeof raw.dividends === "object" ? raw.dividends : {},
      days: raw.days && typeof raw.days === "object" ? raw.days : {},
    };
  } catch {
    return emptyCache();
  }
}

function emptyCache() {
  return { v: CACHE_VERSION, cursor: 0, enrolled: {}, loadWei: "0", retired: 0, dividends: {}, days: {} };
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

function blockOf(log) {
  const n = log.blockNumber;
  if (typeof n === "number") return n;
  return parseInt(n, 16);
}

function blankClass() {
  return { act: 0, deact: 0, up: 0 };
}

function dayBucket(cache, iso) {
  const key = iso || "unknown";
  if (!cache.days[key]) {
    cache.days[key] = { enroll: 0, end: 0, loadWei: "0", burnWei: "0", classes: {}, dividends: {} };
  }
  const day = cache.days[key];
  day.classes = day.classes || {};
  day.dividends = day.dividends || {};
  day.loadWei = String(day.loadWei || "0");
  day.burnWei = String(day.burnWei || "0");
  return day;
}

function tierOf(cls) {
  const spec = CLASSES[Number(cls)];
  return spec ? spec.tier : null;
}

function bumpClass(day, tier, field) {
  if (!tier || !day.classes) return;
  if (!day.classes[tier]) day.classes[tier] = blankClass();
  day.classes[tier][field] += 1;
}

function applyLog(cache, parsed, iso) {
  const day = dayBucket(cache, iso);
  if (parsed.name === "SeatEnrolled") {
    const id = parsed.args.tokenId.toString();
    const load = BigInt(parsed.args.load);
    cache.enrolled[id] = {
      fund: Number(parsed.args.fund),
      cls: Number(parsed.args.shareClass),
      corner: false,
    };
    cache.loadWei = (BigInt(cache.loadWei) + load).toString();
    day.loadWei = (BigInt(day.loadWei) + load).toString();
    day.burnWei = (BigInt(day.burnWei) + load / 2n).toString();
    day.enroll += 1;
    bumpClass(day, tierOf(parsed.args.shareClass), "act");
  } else if (parsed.name === "EnrollmentEnded") {
    const id = parsed.args.tokenId.toString();
    const prev = cache.enrolled[id];
    if (prev) bumpClass(day, tierOf(prev.cls), "deact");
    delete cache.enrolled[id];
    day.end += 1;
  } else if (parsed.name === "SeatsMerged") {
    const kept = parsed.args.kept.toString();
    const prev = cache.enrolled[kept] || { fund: 0, cls: 0, corner: false };
    const retired = parsed.args.retired.toString();
    const prevRetired = cache.enrolled[retired];
    bumpClass(day, tierOf(prev.cls), "up");
    bumpClass(day, tierOf(parsed.args.newClass), "act");
    if (prevRetired) bumpClass(day, tierOf(prevRetired.cls), "deact");
    cache.enrolled[kept] = {
      fund: prev.fund,
      cls: Number(parsed.args.newClass),
      corner: true,
    };
    if (prevRetired) delete cache.enrolled[retired];
    cache.retired += 1;
    day.retired = (day.retired || 0) + 1;
  } else if (parsed.name === "DividendsPosted") {
    const token = String(parsed.args.token).toLowerCase();
    const amount = BigInt(parsed.args.amount);
    const prev = BigInt(cache.dividends[token] || "0");
    cache.dividends[token] = (prev + amount).toString();
    day.dividends[token] = (BigInt(day.dividends[token] || "0") + amount).toString();
  }
}

// getLogs works on the launch range. eth_getCode does not, which is why this
// walk never asks for code. A cold cache starts at the configured genesis
// rather than a fixed lookback: half a million blocks is about fourteen
// hours, and the Seat mint is already older than that.

async function countActiveHolders(rpc, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return 0;
  const skip = new Set([ZERO, SEATS, OPEN_MARKET, DIVIDEND_OFFICE, FUND_DESK]);
  const raw = await rpc.calls(list.map((id) => ({
    to: SEATS,
    data: FACE.encodeFunctionData("ownerOf", [id]),
  })));
  const owners = new Set();
  for (const word of raw) {
    let owner = ZERO;
    try { owner = String(FACE.decodeFunctionResult("ownerOf", word)[0]).toLowerCase(); } catch { continue; }
    if (owner && !skip.has(owner)) owners.add(owner);
  }
  return owners.size;
}

function classWeight(row) {
  const spec = CLASSES[row.cls] || CLASSES[0];
  return row.corner && spec.corner ? spec.corner : spec.weight;
}

function historyFrom(cache) {
  const keys = datedKeys(cache);
  let cum = 0;
  const labels = [];
  const cumulative = [];
  const dailyActivations = [];
  const dailyDeactivations = [];
  for (const key of keys) {
    const day = cache.days[key];
    cum += (day.enroll || 0) - (day.end || 0) - (day.retired || 0);
    labels.push(key);
    cumulative.push(Math.max(0, cum));
    dailyActivations.push(day.enroll || 0);
    dailyDeactivations.push(day.end || 0);
  }
  return { labels, cumulative, dailyActivations, dailyDeactivations };
}

function datedKeys(cache) {
  return Object.keys(cache.days || {}).filter((k) => k !== "unknown").sort();
}

function wholeTokens(wei) {
  return Number(BigInt(wei || "0") / 10n ** 18n);
}

// Cumulative $TMF burned (half of each Front-End Load) at the end of each day.
function burnHistoryFrom(cache) {
  const labels = [];
  const data = [];
  let cum = 0n;
  for (const key of datedKeys(cache)) {
    cum += BigInt(cache.days[key].burnWei || "0");
    const n = wholeTokens(cum);
    if (n > 0) {
      labels.push(key);
      data.push(n);
    }
  }
  return labels.length ? { labels, data, source: "load" } : null;
}

// End-of-day class mix. Act − Up − Deact, carried forward. A day with no
// class stamp is omitted so a pre-v2 bucket cannot draw a false zero.
function classHistoryFrom(cache) {
  const labels = [];
  const running = Object.fromEntries(TIER_IDS.map((id) => [id, 0]));
  const series = Object.fromEntries(TIER_IDS.map((id) => [id, []]));
  for (const key of datedKeys(cache)) {
    const classes = cache.days[key].classes || {};
    if (!Object.keys(classes).length) continue;
    for (const id of TIER_IDS) {
      const row = classes[id] || blankClass();
      running[id] = Math.max(0, running[id] + (row.act || 0) - (row.deact || 0) - (row.up || 0));
      series[id].push(running[id]);
    }
    labels.push(key);
  }
  return { labels, tiers: series };
}

function tierStatsFrom(cache) {
  const now = Date.now();
  const dayMs = 86400000;
  const stats = {};
  for (const id of TIER_IDS) {
    stats[id] = {
      "24h": blankClass(),
      "7d": blankClass(),
      "30d": blankClass(),
      allTime: blankClass(),
    };
  }
  const add = (into, row) => {
    into.act += row.act || 0;
    into.deact += row.deact || 0;
    into.up += row.up || 0;
  };
  for (const [key, day] of Object.entries(cache.days || {})) {
    const classes = day.classes || {};
    const ts = key === "unknown" ? NaN : Date.parse(`${key}T00:00:00Z`);
    const age = Number.isFinite(ts) ? now - ts : Infinity;
    for (const id of TIER_IDS) {
      const row = classes[id];
      if (!row) continue;
      add(stats[id].allTime, row);
      if (age <= dayMs) add(stats[id]["24h"], row);
      if (age <= 7 * dayMs) add(stats[id]["7d"], row);
      if (age <= 30 * dayMs) add(stats[id]["30d"], row);
    }
  }
  return stats;
}

function postedByDay(cache, metas) {
  const keys = datedKeys(cache);
  const tokens = Object.keys(cache.dividends || {});
  if (!keys.length || !tokens.length) return null;
  return {
    labels: keys,
    tokens: tokens.map((address) => {
      const meta = metas.get(address) || { symbol: address.slice(0, 6), decimals: 18 };
      const scale = 10n ** BigInt(meta.decimals);
      return {
        address,
        symbol: meta.symbol,
        amounts: keys.map((key) => {
          const wei = cache.days[key]?.dividends?.[address] || "0";
          return Number(BigInt(wei) / scale);
        }),
      };
    }),
  };
}

async function tokenMeta(rpc, address) {
  try {
    const [symRaw, decRaw] = await rpc.calls([
      { to: address, data: FACE.encodeFunctionData("symbol", []) },
      { to: address, data: FACE.encodeFunctionData("decimals", []) },
    ]);
    return {
      symbol: FACE.decodeFunctionResult("symbol", symRaw)[0],
      decimals: Number(FACE.decodeFunctionResult("decimals", decRaw)[0]),
    };
  } catch {
    return { symbol: address.slice(0, 6), decimals: 18 };
  }
}

async function fetchMutualFun({ rpc, blockTime, ethPriceUsd, tokenPriceUsd, tokenPrices, genesisBlock }) {
  const head = await rpc.blockNumber();
  const cache = loadCache();
  const genesis = Number(genesisBlock) > 0 ? Number(genesisBlock) : 1;
  const from = cache.cursor > 0 ? cache.cursor + 1 : genesis;
  if (from <= head) {
    const logs = await rpc.getLogs({
      address: DIVIDEND_OFFICE,
      fromBlock: from,
      toBlock: head,
      topics: [TOPIC],
    });
    for (const log of logs) {
      let parsed;
      try { parsed = FACE.parseLog(log); } catch { continue; }
      const block = blockOf(log);
      const iso = blockTime ? dates.utcIsoFromTs(blockTime.at(block)) : "";
      applyLog(cache, parsed, iso);
    }
    cache.cursor = head;
    saveCache(cache);
  }

  const liveCalls = [
    { to: SEATS, data: FACE.encodeFunctionData("nextSeat", []) },
    { to: DIVIDEND_OFFICE, data: FACE.encodeFunctionData("totalWeightAll", []) },
  ];
  for (const fund of FUNDS) {
    liveCalls.push({ to: DIVIDEND_OFFICE, data: FACE.encodeFunctionData("enrolledCount", [fund.id]) });
    liveCalls.push({ to: FUND_DESK, data: FACE.encodeFunctionData("navInWeth", [fund.id]) });
    liveCalls.push({ to: FUND_DESK, data: FACE.encodeFunctionData("isOpen", [fund.id]) });
  }
  const raw = await rpc.calls(liveCalls);
  const minted = Number(FACE.decodeFunctionResult("nextSeat", raw[0])[0]);
  const weightAll = Number(FACE.decodeFunctionResult("totalWeightAll", raw[1])[0]);
  const px = Number(ethPriceUsd) || 0;
  const funds = FUNDS.map((fund, i) => {
    const base = 2 + i * 3;
    const enrolled = Number(FACE.decodeFunctionResult("enrolledCount", raw[base])[0]);
    const navEth = Number(FACE.decodeFunctionResult("navInWeth", raw[base + 1])[0]) / 1e18;
    const open = Boolean(FACE.decodeFunctionResult("isOpen", raw[base + 2])[0]);
    return {
      id: fund.id,
      name: fund.name,
      enrolled,
      navEth: +navEth.toFixed(4),
      navUsd: px > 0 ? +(navEth * px).toFixed(2) : 0,
      open,
    };
  });

  const breakdown = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
  const byFund = FUNDS.map(() => ({ T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 }));
  let corners = 0;
  let replayWeight = 0;
  for (const row of Object.values(cache.enrolled)) {
    const spec = CLASSES[row.cls];
    if (!spec) continue;
    breakdown[spec.tier] += 1;
    if (byFund[row.fund]) byFund[row.fund][spec.tier] += 1;
    if (row.corner) corners += 1;
    replayWeight += classWeight(row);
  }
  const enrolledLive = funds.reduce((sum, fund) => sum + fund.enrolled, 0);
  const loadTokens = Number(BigInt(cache.loadWei) / 10n ** 18n);
  const burnedTokens = loadTokens / 2;
  const tokenPx = Number(tokenPriceUsd) || 0;
  const prices = tokenPrices || {};

  const dividends = [];
  const metas = new Map();
  for (const [address, wei] of Object.entries(cache.dividends)) {
    const meta = await tokenMeta(rpc, address);
    const symbol = address === TOKEN ? "TMF" : address === WETH ? "WETH" : meta.symbol;
    metas.set(address, { symbol, decimals: meta.decimals });
    const amount = Number(BigInt(wei) / 10n ** BigInt(meta.decimals));
    const known = address === TOKEN ? tokenPx : address === WETH ? px : (Number(prices[address]) || 0);
    dividends.push({
      address,
      symbol,
      amount,
      usd: known > 0 ? +(amount * known).toFixed(2) : 0,
    });
  }
  dividends.sort((a, b) => b.usd - a.usd || b.amount - a.amount);

  let activeHolders = null;
  try {
    activeHolders = await countActiveHolders(rpc, Object.keys(cache.enrolled));
  } catch (e) {
    console.warn(`[warn] mutual fun active holders: ${e.message}`);
  }

  let floorEth = 0;
  try {
    const res = await fetch("https://api.opensea.io/api/v2/collections/themutualfun/stats", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const body = await res.json();
      const sym = String(body.total?.floor_price_symbol || "ETH").toUpperCase();
      const floor = Number(body.total?.floor_price);
      if (floor > 0 && (sym === "ETH" || sym === "WETH")) floorEth = floor;
    }
  } catch (e) {
    console.warn(`[warn] mutual fun floor: ${e.message}`);
  }

  const tiers = CLASSES.map((row) => ({
    tier: row.tier,
    name: row.name,
    reqTokens: row.load,
    weight: row.weight,
    cornerWeight: row.corner,
    trackedAnnualYieldUsd: 0,
    active: breakdown[row.tier] || 0,
  }));

  const burnHistory = burnHistoryFrom(cache);
  const classHistory = classHistoryFrom(cache);

  console.log(
    `  mutual fun: ${minted} seats, ${enrolledLive} enrolled, ` +
    `replay ${Object.keys(cache.enrolled).length} weight ${replayWeight} chain ${weightAll}` +
    (activeHolders != null ? `, ${activeHolders} wallets` : ""),
  );

  return {
    config: {
      kind: "mutual",
      ticker: "TMF",
      name: "The Mutual Fun",
      logo: "Mutual.png",
      maxSupply: MAX_SEATS,
      nftCa: SEATS,
      tokenCa: TOKEN,
      passCa: PASS,
      ammCa: OPEN_MARKET,
      activationCa: DIVIDEND_OFFICE,
      fundDesk: FUND_DESK,
      pricePool: PRICE_POOL,
      site: SITE,
      houseRate: HOUSE_RATE,
      randomTake: 0.08,
      specificTake: 0.16,
      handInTake: 0.08,
    },
    market: {
      ethPriceUsd: px,
      tokenPriceUsd: tokenPx,
      nftFloorEth: floorEth,
      nftFloorUsd: px > 0 ? +(floorEth * px).toFixed(2) : 0,
    },
    funds: funds.map((fund, i) => ({ ...fund, classes: byFund[i] })),
    seats: { minted, max: MAX_SEATS, retired: cache.retired },
    tiers,
    activation: {
      activeCount: enrolledLive,
      activeHolders,
      totalSupply: minted,
      percentActivated: minted > 0 ? +((enrolledLive / minted) * 100).toFixed(2) : 0,
      breakdown,
      cornerOffices: corners,
      weight: weightAll,
      replayWeight,
      tierStats: tierStatsFrom(cache),
      history: historyFrom(cache),
      classHistory,
      dualBurn: {
        totalBurnTokens: burnedTokens,
        equivalentBrokersBurnt: cache.retired,
      },
    },
    ownership: {
      nftHolders: null,
      tokenHolders: null,
      circulatingSupply: null,
      permanentlyBurntTokens: burnedTokens,
      burntNfts: cache.retired,
      currentMaxSupply: MAX_SEATS,
      burnHistory,
    },
    revenue: {
      loadTokens,
      burnedTokens,
      bookTokens: loadTokens / 2,
      loadUsd: tokenPx > 0 ? +(loadTokens * tokenPx).toFixed(2) : 0,
      burnedUsd: tokenPx > 0 ? +(burnedTokens * tokenPx).toFixed(2) : 0,
      dividends,
      postedByDay: postedByDay(cache, metas),
    },
    dailySnapshots: [],
  };
}

module.exports = {
  fetchMutualFun,
  applyLog,
  emptyCache,
  burnHistoryFrom,
  classHistoryFrom,
  tierStatsFrom,
  historyFrom,
  FUNDS,
  CLASSES,
  SEATS,
  TOKEN,
  OPEN_MARKET,
  PRICE_POOL,
  SITE,
};
