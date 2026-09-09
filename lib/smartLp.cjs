// Safety Deposit Box Smart LPs — one immutable Uniswap v3 vault per market×mode.
//
// There is no public factory to enumerate. Each vault is its own ERC-20
// (`sdBASE-FR|BB|ASK`). Discovery is chain-wide FeesCollected logs plus any
// previously known vault CAs (quiet vaults with TVL but no skim this week).
// Protocol fees are the event skim, kept off the oracle AMM series so booster
// routing is not double-counted as Clock-In box revenue.

const { ethers } = require("ethers");
const { decodeUint, decodeAddr } = require("./rpc.cjs");
const { decimalsOf } = require("./chain.cjs");

const SITE = "https://www.stonkbrokers.cash/locker";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const SEL_VAULT = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  mode: "0x295a5212",
  totalValueQuote: "0x870ddc97",
  baseToken: "0xc55dae63",
  quoteToken: "0x217a4b70",
  pool: "0x16f0115b",
  feeRecipientA: "0x76166f3b",
  feeRecipientB: "0xe89af63e",
  perfFeeBps: "0xc2f7e23e",
};
const SEL_POOL = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
};
const TOPIC_FEES_COLLECTED =
  "0xf5d590414d56d256b8c16b850d0b57f2f5d2ed90686166e150b48a96f0dbdd61";

const MODE_LABEL = { 0: "Full Range", 1: "Balanced Band", 2: "Ask" };

const STRING_IFACE = new ethers.Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const SEED = ["0x316c530a5e71dc4bac8968cb777c2c1839b29cb4"];

function decodeStr(hex, fn) {
  if (!hex || hex === "0x") return "";
  try {
    return STRING_IFACE.decodeFunctionResult(fn, hex)[0] || "";
  } catch {
    return "";
  }
}

function isSmartLpName(name) {
  return /^Safety Deposit Box Smart LP /i.test(name || "");
}

function marketFrom(name, symbol) {
  const m = String(name || "").match(/Smart LP\s+([A-Za-z0-9.]+)\/([A-Za-z0-9.]+)/i);
  if (m) return `${m[1]}/${m[2]}`.toUpperCase();
  const s = String(symbol || "").replace(/^sd/i, "").replace(/-(FR|BB|ASK)$/i, "");
  return s || "—";
}

function modeFromSymbol(symbol, modeNum) {
  if (modeNum === 0 || modeNum === 1 || modeNum === 2) return modeNum;
  const s = String(symbol || "").toUpperCase();
  if (s.endsWith("-FR")) return 0;
  if (s.endsWith("-BB")) return 1;
  if (s.endsWith("-ASK")) return 2;
  return null;
}

function asUsd(raw, decimals, px) {
  if (raw == null || !(px > 0)) return 0;
  const n = Number(raw) / 10 ** decimals;
  return Number.isFinite(n) && n > 0 ? n * px : 0;
}

function quoteUsd(token, ethUsd, tokenPrices) {
  const t = String(token || "").toLowerCase();
  if (!t.startsWith("0x")) return 0;
  if (t === WETH) return Number(ethUsd) || 0;
  if (t === USDG) return 1;
  return Number(tokenPrices?.[t]) || 0;
}

async function hydrateDexPrices(tokens, tokenPrices, ethUsd) {
  const prices = { ...(tokenPrices || {}) };
  const missing = [...new Set(tokens.map((t) => String(t || "").toLowerCase()))]
    .filter((t) => t.startsWith("0x") && !(quoteUsd(t, ethUsd, prices) > 0));
  for (let i = 0; i < missing.length; i += 20) {
    const chunk = missing.slice(i, i + 20);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const pair of data.pairs || []) {
        const px = parseFloat(pair.priceUsd);
        if (!(px > 0)) continue;
        const base = String(pair.baseToken?.address || "").toLowerCase();
        const quote = String(pair.quoteToken?.address || "").toLowerCase();
        if (base && !(quoteUsd(base, ethUsd, prices) > 0)) prices[base] = px;
        if (quote && quote !== WETH && quote !== USDG && !(quoteUsd(quote, ethUsd, prices) > 0)) {
          const native = parseFloat(pair.priceNative);
          if (native > 0) prices[quote] = px / native;
        }
      }
    } catch (e) {
      console.warn(`[warn] smart LP dex prices: ${e.message}`);
    }
  }
  return prices;
}

function parseAddr(hex) {
  if (!hex || hex === "0x") return null;
  const a = decodeAddr(hex);
  if (!a || a === "0x0000000000000000000000000000000000000000") return null;
  return a;
}

function emptyResult(lookbackDays) {
  return {
    vaults: [],
    totalTvlUsd: 0,
    fees7dUsd: 0,
    daily: Array(lookbackDays).fill(0),
    feeSplit: {
      buybackBps: 5000,
      boosterBps: 5000,
      note: "Vault trading fees are what the Smart LP UI calls fees generated. The protocol skim (perfFeeBps, typically 10%) is split 50% STONK buyback / 50% StonkBooster.",
    },
    site: SITE,
    feeRecipientA: null,
    feeRecipientB: null,
    perfFeeBps: null,
    protocolFees7dUsd: 0,
  };
}

async function fetchSmartLps({
  rpc,
  blockTime,
  sevenDaysAgo,
  ethPriceUsd,
  tokenPrices = {},
  lookbackDays = 7,
  knownCas = [],
} = {}) {
  const empty = emptyResult(lookbackDays);
  if (!rpc || !blockTime) return empty;

  const fromBlock = blockTime.blockAt(sevenDaysAgo) || 0;
  let toBlock = 0;
  try {
    toBlock = await rpc.blockNumber();
  } catch {
    return empty;
  }
  if (!(fromBlock && toBlock && toBlock > fromBlock)) return empty;

  let logs = [];
  try {
    logs = await rpc.getLogs(
      { fromBlock, toBlock, topics: [TOPIC_FEES_COLLECTED] },
      (to, end, n) => process.stdout.write(`\r    smart LP fees: block ${to}/${end}, ${n} logs   `),
    );
    process.stdout.write(`\r    smart LP fees: ${logs.length} logs`.padEnd(70) + "\n");
  } catch (e) {
    console.warn(`[warn] smart LP FeesCollected walk failed: ${e.message}`);
  }

  const cas = new Set(
    [...SEED, ...knownCas, ...logs.map((l) => String(l.address || "").toLowerCase())]
      .map((a) => String(a || "").toLowerCase())
      .filter((a) => a.length === 42),
  );
  const listed = [...cas];
  if (!listed.length) return empty;

  const metaKeys = ["name", "symbol", "mode", "totalValueQuote", "baseToken", "quoteToken", "pool", "feeRecipientA", "feeRecipientB", "perfFeeBps"];
  const calls = [];
  for (const ca of listed) {
    for (const k of metaKeys) calls.push({ to: ca, data: SEL_VAULT[k] });
  }
  const raw = await rpc.calls(calls);

  const vaults = [];
  const poolSet = new Set();
  const tokenSet = new Set([WETH, USDG]);
  let feeRecipientA = null;
  let feeRecipientB = null;
  let perfFeeBps = null;

  listed.forEach((ca, i) => {
    const o = i * metaKeys.length;
    const name = decodeStr(raw[o], "name");
    if (!isSmartLpName(name)) return;
    const tvlRaw = decodeUint(raw[o + 3]);
    const quote = parseAddr(raw[o + 5]);
    if (tvlRaw == null || !quote) return;
    const symbol = decodeStr(raw[o + 1], "symbol");
    const mode = modeFromSymbol(symbol, Number(decodeUint(raw[o + 2]) ?? -1));
    const base = parseAddr(raw[o + 4]);
    const pool = parseAddr(raw[o + 6]);
    const a = parseAddr(raw[o + 7]);
    const b = parseAddr(raw[o + 8]);
    const pfb = decodeUint(raw[o + 9]);
    if (a && !feeRecipientA) feeRecipientA = a;
    if (b && !feeRecipientB) feeRecipientB = b;
    if (pfb != null && perfFeeBps == null) perfFeeBps = Number(pfb);
    if (pool) poolSet.add(pool);
    if (base) tokenSet.add(base);
    tokenSet.add(quote);
    vaults.push({
      ca,
      name,
      symbol,
      holders: 0,
      mode,
      modeLabel: MODE_LABEL[mode] || "Vault",
      market: marketFrom(name, symbol),
      baseToken: base,
      quoteToken: quote,
      pool,
      tvlQuoteRaw: tvlRaw,
      fees7dUsd: 0,
      protocolFees7dUsd: 0,
    });
  });

  if (!vaults.length) return empty;

  const poolList = [...poolSet];
  const poolCalls = [];
  for (const p of poolList) {
    poolCalls.push({ to: p, data: SEL_POOL.token0 });
    poolCalls.push({ to: p, data: SEL_POOL.token1 });
  }
  const poolRaw = poolList.length ? await rpc.calls(poolCalls) : [];
  const poolTokens = new Map();
  poolList.forEach((p, i) => {
    const t0 = parseAddr(poolRaw[i * 2]);
    const t1 = parseAddr(poolRaw[i * 2 + 1]);
    if (t0) tokenSet.add(t0);
    if (t1) tokenSet.add(t1);
    poolTokens.set(p, { token0: t0, token1: t1 });
  });

  const prices = await hydrateDexPrices([...tokenSet], tokenPrices, ethPriceUsd);
  const decimals = await decimalsOf(rpc, [...tokenSet]);
  const pxOf = (token) => quoteUsd(token, ethPriceUsd, prices);

  for (const v of vaults) {
    const dec = decimals.get(v.quoteToken) ?? 18;
    const px = pxOf(v.quoteToken) || (v.quoteToken === USDG ? 1 : 0);
    v.tvlUsd = +asUsd(v.tvlQuoteRaw, dec, px).toFixed(2);
    delete v.tvlQuoteRaw;
  }

  const byCa = new Map(vaults.map((v) => [v.ca, v]));
  const daily = Array(lookbackDays).fill(0);
  const oneDay = 86400;
  let feesGenerated = 0;
  let protocolFees = 0;

  for (const log of logs) {
    const ca = String(log.address || "").toLowerCase();
    const v = byCa.get(ca);
    if (!v) continue;
    const pair = v.pool ? poolTokens.get(v.pool) : null;
    const fees0 = decodeUint(log.data, 0);
    const fees1 = decodeUint(log.data, 1);
    const skim0 = decodeUint(log.data, 2);
    const skim1 = decodeUint(log.data, 3);
    let generated = 0;
    let skim = 0;
    if (pair?.token0) {
      generated += asUsd(fees0, decimals.get(pair.token0) ?? 18, pxOf(pair.token0));
      skim += asUsd(skim0, decimals.get(pair.token0) ?? 18, pxOf(pair.token0));
    }
    if (pair?.token1) {
      generated += asUsd(fees1, decimals.get(pair.token1) ?? 18, pxOf(pair.token1));
      skim += asUsd(skim1, decimals.get(pair.token1) ?? 18, pxOf(pair.token1));
    }
    if (!(generated > 0) && !(skim > 0)) continue;
    const bn = parseInt(log.blockNumber, 16);
    const ts = blockTime.at(bn) || 0;
    if (ts < sevenDaysAgo) continue;
    const dayIdx = Math.max(0, Math.min(lookbackDays - 1, Math.floor((ts - sevenDaysAgo) / oneDay)));
    daily[dayIdx] += skim;
    feesGenerated += generated;
    protocolFees += skim;
    v.fees7dUsd += generated;
    v.protocolFees7dUsd += skim;
  }

  for (const v of vaults) {
    v.fees7dUsd = +Number(v.fees7dUsd).toFixed(2);
    v.protocolFees7dUsd = +Number(v.protocolFees7dUsd).toFixed(2);
  }
  vaults.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0) || (b.fees7dUsd || 0) - (a.fees7dUsd || 0));

  const totalTvlUsd = +vaults.reduce((s, v) => s + (v.tvlUsd || 0), 0).toFixed(2);
  feesGenerated = +feesGenerated.toFixed(2);
  protocolFees = +protocolFees.toFixed(2);
  const dailyOut = daily.map((n) => +Number(n).toFixed(4));

  console.log(`  smart LP: ${vaults.length} vaults, TVL $${totalTvlUsd.toFixed(0)}, generated $${feesGenerated.toFixed(2)}, protocol skim $${protocolFees.toFixed(2)}`);

  return {
    ...empty,
    vaults,
    totalTvlUsd,
    fees7dUsd: feesGenerated,
    protocolFees7dUsd: protocolFees,
    daily: dailyOut,
    feeRecipientA,
    feeRecipientB,
    perfFeeBps,
  };
}

module.exports = {
  fetchSmartLps,
  WETH,
  USDG,
  TOPIC_FEES_COLLECTED,
};
