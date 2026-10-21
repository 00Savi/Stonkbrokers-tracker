// Safety Deposit Box Smart LPs — one immutable Uniswap v3 vault per market×mode.
//
// There is no public factory to enumerate. Each vault is its own ERC-20
// (`sdBASE-FR|BB|ASK`). Discovery is chain-wide FeesCollected logs plus any
// previously known vault CAs (quiet vaults with TVL but no skim this week).
// Protocol fees are the event skim, kept off the oracle AMM series so booster
// routing is not double-counted as Clock-In box revenue.

const { ethers } = require("ethers");
const { decodeUint, decodeAddr, encodeAddr } = require("./rpc.cjs");
const { decimalsOf } = require("./chain.cjs");
const { amountsForLiquidity, rawToUsd } = require("./lpHold.cjs");
const dates = require("./dates.cjs");

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

const SEL_HOLD = {
  tickLower: "0x59c4f905",
  tickUpper: "0x55b812a8",
  positionId: "0x71640de3",
  nfpm: "0x7303e913",
  slot0: "0x3850c7bd",
  positions: "0x99fbab88",
};
const TOPIC_SWAP = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

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

/** Address-filtered FeesCollected when we already know the vaults. A chain-wide
 *  7-day scan is what made the hourly job give up and replay yesterday's $1,791. */
async function collectFeeLogs(rpc, fromBlock, toBlock, addresses) {
  const progress = (to, end, n) => process.stdout.write(`\r    smart LP fees: block ${to}/${end}, ${n} logs   `);
  if (!addresses.length) {
    return rpc.getLogs({ fromBlock, toBlock, topics: [TOPIC_FEES_COLLECTED] }, progress);
  }
  const logs = [];
  const chunkSize = 40;
  for (let i = 0; i < addresses.length; i += chunkSize) {
    const chunk = addresses.slice(i, i + chunkSize);
    const part = await rpc.getLogs(
      { address: chunk, fromBlock, toBlock, topics: [TOPIC_FEES_COLLECTED] },
      i === 0 ? progress : undefined,
    );
    logs.push(...part);
  }
  return logs;
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

  const fromBlock = blockTime.blockAt(dates.utcMidnightSec() - (lookbackDays - 1) * 86400)
    || blockTime.blockAt(sevenDaysAgo)
    || 0;
  let toBlock = 0;
  try {
    toBlock = await rpc.blockNumber();
  } catch {
    return empty;
  }
  if (!(fromBlock && toBlock && toBlock > fromBlock)) return empty;

  const known = [...SEED, ...knownCas]
    .map((a) => String(a || "").toLowerCase())
    .filter((a) => a.length === 42);
  const knownUniq = [...new Set(known)];

  let logs = [];
  let feeWalkOk = false;
  try {
    logs = await collectFeeLogs(rpc, fromBlock, toBlock, knownUniq);
    feeWalkOk = true;
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
    const pair = v.pool ? poolTokens.get(v.pool) : null;
    if (pair?.token0) v.token0 = pair.token0;
    if (pair?.token1) v.token1 = pair.token1;
    const dec = decimals.get(v.quoteToken) ?? 18;
    const px = pxOf(v.quoteToken) || (v.quoteToken === USDG ? 1 : 0);
    v.tvlUsd = +asUsd(v.tvlQuoteRaw, dec, px).toFixed(2);
    delete v.tvlQuoteRaw;
  }

  const byCa = new Map(vaults.map((v) => [v.ca, v]));
  const daily = Array(lookbackDays).fill(0);
  const dailyGross = Array(lookbackDays).fill(0);
  const windowStart = dates.utcMidnightSec() - (lookbackDays - 1) * 86400;
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
    if (ts < windowStart) continue;
    const dayIdx = Math.floor((dates.utcMidnightSec(new Date(ts * 1000)) - windowStart) / 86400);
    if (dayIdx < 0 || dayIdx >= lookbackDays) continue;
    daily[dayIdx] += skim;
    dailyGross[dayIdx] += generated;
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
  const dailyGrossOut = dailyGross.map((n) => +Number(n).toFixed(4));

  console.log(`  smart LP: ${vaults.length} vaults, TVL $${totalTvlUsd.toFixed(0)}, generated $${feesGenerated.toFixed(2)}, protocol skim $${protocolFees.toFixed(2)}`);
  await attachVersusHold(vaults, { rpc, blockTime, lookbackDays, decimals, pxOf });

  return {
    ...empty,
    vaults,
    totalTvlUsd,
    fees7dUsd: feesGenerated,
    protocolFees7dUsd: protocolFees,
    daily: dailyOut,
    dailyGross: dailyGrossOut,
    feeRecipientA,
    feeRecipientB,
    perfFeeBps,
    feeWalkOk,
  };
}

/**
 * Shape a gg-index `/smart_lps` payload into the same result as `fetchSmartLps`.
 *
 * Returns null when the index has no vaults, so the caller can fall through
 * to the chain walk instead of publishing an empty list.
 */
async function fromGgIndex(payload, { ethPriceUsd, tokenPrices = {}, lookbackDays = 7, rpc, blockTime, knownVaults = [] } = {}) {
  const listed = Array.isArray(payload?.vaults) ? payload.vaults : [];
  if (!listed.length || !rpc) return null;

  const empty = emptyResult(lookbackDays);
  const known = new Map(
    (knownVaults || [])
      .map((v) => [String(v.ca || v.address || "").toLowerCase(), v])
      .filter(([k]) => k.length === 42),
  );
  const tokenSet = new Set([WETH, USDG]);
  const pickToken = (row, key, fallbackKeys = []) => {
    const raw = row[key] || fallbackKeys.map((k) => row[k]).find(Boolean);
    if (raw) return String(raw).toLowerCase();
    const prev = known.get(String(row.address || "").toLowerCase());
    for (const k of [key, ...fallbackKeys]) {
      const v = prev?.[k];
      if (v) return String(v).toLowerCase();
    }
    return "";
  };

  for (const v of listed) {
    for (const t of [
      pickToken(v, "quote_token", ["quoteToken"]),
      pickToken(v, "base_token", ["baseToken"]),
      pickToken(v, "token0"),
      pickToken(v, "token1"),
    ]) {
      if (t) tokenSet.add(t);
    }
  }

  const prices = await hydrateDexPrices([...tokenSet], tokenPrices, ethPriceUsd);
  const decimals = await decimalsOf(rpc, [...tokenSet]);
  const pxOf = (token) => quoteUsd(token, ethPriceUsd, prices);

  const vaults = [];
  let feeRecipientA = payload.fee_recipient_a || null;
  let feeRecipientB = payload.fee_recipient_b || null;
  let perfFeeBps = null;
  const daily = Array(lookbackDays).fill(0);
  const dailyGross = Array(lookbackDays).fill(0);
  let feesGenerated = 0;
  let protocolFees = 0;

  for (const row of listed) {
    const quote = pickToken(row, "quote_token", ["quoteToken"]);
    const dec = decimals.get(quote) ?? 18;
    const px = pxOf(quote) || (quote === USDG ? 1 : 0);
    const tvlUsd = +asUsd(row.tvl_quote, dec, px).toFixed(2);
    const f = row.fees || {};
    const t0 = pickToken(row, "token0");
    const t1 = pickToken(row, "token1");
    const generated =
      asUsd(f.fees0, decimals.get(t0) ?? 18, pxOf(t0)) +
      asUsd(f.fees1, decimals.get(t1) ?? 18, pxOf(t1));
    const skim =
      asUsd(f.skim0, decimals.get(t0) ?? 18, pxOf(t0)) +
      asUsd(f.skim1, decimals.get(t1) ?? 18, pxOf(t1));
    const days = Array.isArray(row.daily) ? row.daily : [];
    days.forEach((d, i) => {
      if (i >= lookbackDays) return;
      dailyGross[i] +=
        asUsd(d.fees0, decimals.get(t0) ?? 18, pxOf(t0)) +
        asUsd(d.fees1, decimals.get(t1) ?? 18, pxOf(t1));
      daily[i] +=
        asUsd(d.skim0, decimals.get(t0) ?? 18, pxOf(t0)) +
        asUsd(d.skim1, decimals.get(t1) ?? 18, pxOf(t1));
    });
    if (row.fee_recipient_a && !feeRecipientA) feeRecipientA = row.fee_recipient_a;
    if (row.fee_recipient_b && !feeRecipientB) feeRecipientB = row.fee_recipient_b;
    if (row.perf_fee_bps != null && perfFeeBps == null) perfFeeBps = Number(row.perf_fee_bps);
    feesGenerated += generated;
    protocolFees += skim;
    vaults.push({
      ca: String(row.address || "").toLowerCase(),
      name: row.name,
      symbol: row.symbol,
      holders: 0,
      mode: row.mode,
      modeLabel: row.mode_label || MODE_LABEL[row.mode] || "Vault",
      market: row.market,
      baseToken: pickToken(row, "base_token", ["baseToken"]) || undefined,
      quoteToken: quote || undefined,
      pool: row.pool,
      token0: t0 || undefined,
      token1: t1 || undefined,
      fees7dUsd: +Number(generated).toFixed(2),
      protocolFees7dUsd: +Number(skim).toFixed(2),
      tvlUsd,
    });
  }

  vaults.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0) || (b.fees7dUsd || 0) - (a.fees7dUsd || 0));
  const totalTvlUsd = +vaults.reduce((s, v) => s + (v.tvlUsd || 0), 0).toFixed(2);
  console.log(
    `  smart LP: ${vaults.length} vaults from gg-index, TVL $${totalTvlUsd.toFixed(0)}, generated $${feesGenerated.toFixed(2)}, protocol skim $${protocolFees.toFixed(2)}`,
  );
  await attachVersusHold(vaults, { rpc, blockTime, lookbackDays, decimals, pxOf });

  return {
    ...empty,
    vaults,
    totalTvlUsd,
    fees7dUsd: +feesGenerated.toFixed(2),
    protocolFees7dUsd: +protocolFees.toFixed(2),
    daily: daily.map((n) => +Number(n).toFixed(4)),
    dailyGross: dailyGross.map((n) => +Number(n).toFixed(4)),
    feeRecipientA,
    feeRecipientB,
    perfFeeBps,
    site: payload.site || SITE,
    unpriced: !(protocolFees > 0) && listed.some((v) => Number(v?.fees?.skim0) > 0 || Number(v?.fees?.skim1) > 0),
  };
}

async function sqrtPriceBefore(rpc, pools, thenBlock) {
  const found = new Map();
  let pending = pools.slice();
  let to = thenBlock;
  const span = 99_999;
  for (let hop = 0; hop < 70 && pending.length; hop++) {
    const from = Math.max(1, to - span);
    const next = [];
    for (let i = 0; i < pending.length; i += 10) {
      const chunk = pending.slice(i, i + 10);
      let logs = [];
      try {
        logs = await rpc.getLogs({
          address: chunk,
          fromBlock: from,
          toBlock: to,
          topics: [TOPIC_SWAP],
        });
      } catch (e) {
        console.warn(`[warn] smart LP hold swaps: ${e.message}`);
        next.push(...chunk);
        continue;
      }
      for (const log of logs) {
        const pool = String(log.address || "").toLowerCase();
        const bn = parseInt(log.blockNumber, 16);
        const prev = found.get(pool);
        if (prev && prev.bn > bn) continue;
        const sqrt = decodeUint(log.data, 2);
        if (!sqrt) continue;
        found.set(pool, { bn, sqrt });
      }
      for (const p of chunk) if (!found.has(p)) next.push(p);
    }
    pending = next;
    if (from <= 1) break;
    to = from - 1;
  }
  console.log(`  smart LP hold prices ${found.size}/${pools.length}`);
  return found;
}

function decodeInt(hex, wordIndex = 0) {
  const u = decodeUint(hex, wordIndex);
  if (u == null) return null;
  const v = u >= 1n << 255n ? u - (1n << 256n) : u;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

async function attachVersusHold(vaults, { rpc, blockTime, lookbackDays, decimals, pxOf }) {
  if (!rpc || !blockTime || !vaults?.length || !decimals || !pxOf) return;
  const thenTs = dates.utcMidnightSec() - (lookbackDays - 1) * 86400;
  const thenBlock = blockTime.blockAt(thenTs);
  const thenAt = thenBlock ? blockTime.at(thenBlock) : 0;
  if (!thenBlock || !thenAt || Math.abs(thenAt - thenTs) > 36 * 3600) {
    console.warn("[warn] smart LP hold: block-time table does not cover the window start");
    return;
  }

  const meta = await rpc.calls(
    vaults.flatMap((v) => [
      { to: v.ca, data: SEL_HOLD.tickLower },
      { to: v.ca, data: SEL_HOLD.tickUpper },
      { to: v.ca, data: SEL_HOLD.positionId },
      { to: v.ca, data: SEL_HOLD.nfpm },
    ]),
  );

  const ready = [];
  const pools = [];
  const poolIndex = new Map();
  vaults.forEach((v, i) => {
    const o = i * 4;
    const tickLower = decodeInt(meta[o]);
    const tickUpper = decodeInt(meta[o + 1]);
    const positionId = decodeUint(meta[o + 2]);
    const nfpm = parseAddr(meta[o + 3]);
    const pool = v.pool ? String(v.pool).toLowerCase() : "";
    if (tickLower == null || tickUpper == null || positionId == null || !nfpm || !pool) return;
    if (!v.token0 || !v.token1) return;
    if (!poolIndex.has(pool)) {
      poolIndex.set(pool, pools.length);
      pools.push(pool);
    }
    ready.push({ v, tickLower, tickUpper, positionId, nfpm, pool });
  });
  if (!ready.length) return;

  const slotNow = await rpc.calls(pools.map((p) => ({ to: p, data: SEL_HOLD.slot0 })));
  const sqrtThenByPool = await sqrtPriceBefore(rpc, pools, thenBlock);
  const idleRaw = await rpc.calls(
    ready.flatMap((r) => [
      { to: r.v.token0, data: "0x70a08231" + encodeAddr(r.v.ca) },
      { to: r.v.token1, data: "0x70a08231" + encodeAddr(r.v.ca) },
    ]),
  );
  const posRaw = await rpc.calls(
    ready.map((r) => ({
      to: r.nfpm,
      data: SEL_HOLD.positions + r.positionId.toString(16).padStart(64, "0"),
    })),
  );

  let priced = 0;
  let keptSum = 0;
  let gapSum = 0;
  ready.forEach((row, i) => {
    const pi = poolIndex.get(row.pool);
    const sqrtNow = decodeUint(slotNow[pi], 0);
    const sqrtThen = sqrtThenByPool.get(row.pool)?.sqrt ?? null;
    const liquidity = decodeUint(posRaw[i], 7);
    if (sqrtNow == null || sqrtThen == null || sqrtNow === 0n || sqrtThen === 0n) return;
    if (liquidity == null || liquidity === 0n) return;
    const now = amountsForLiquidity(sqrtNow, row.tickLower, row.tickUpper, liquidity);
    const then = amountsForLiquidity(sqrtThen, row.tickLower, row.tickUpper, liquidity);
    if (!now || !then) return;
    const t0 = String(row.v.token0).toLowerCase();
    const t1 = String(row.v.token1).toLowerCase();
    const p0 = pxOf(t0);
    const p1 = pxOf(t1);
    if (!(p0 > 0) || !(p1 > 0)) return;
    const d0 = decimals.get(t0) ?? 18;
    const d1 = decimals.get(t1) ?? 18;
    const idle0 = decodeUint(idleRaw[i * 2]) || 0n;
    const idle1 = decodeUint(idleRaw[i * 2 + 1]) || 0n;
    const valueNow = rawToUsd(now.amount0 + idle0, d0, p0) + rawToUsd(now.amount1 + idle1, d1, p1);
    const valueThen = rawToUsd(then.amount0 + idle0, d0, p0) + rawToUsd(then.amount1 + idle1, d1, p1);
    const feesKept = +((Number(row.v.fees7dUsd) || 0) - (Number(row.v.protocolFees7dUsd) || 0)).toFixed(2);
    const tvl = Number(row.v.tvlUsd) || 0;
    const matched = tvl > 0 && valueNow > tvl * 0.5 && valueNow < tvl * 2;
    if (!matched) return;
    const gapUsd = +(valueNow - valueThen).toFixed(2);
    const netUsd = +(feesKept + gapUsd).toFixed(2);
    row.v.versusHold = {
      feesKeptUsd: feesKept,
      gapUsd,
      netUsd,
      windowDays: lookbackDays,
    };
    priced += 1;
    keptSum += feesKept;
    gapSum += gapUsd;
  });
  if (priced) {
    console.log(
      `  smart LP hold: ${priced}/${vaults.length} vaults, fees kept $${keptSum.toFixed(0)}, versus hold $${gapSum.toFixed(0)}`,
    );
  } else {
    console.warn(`[warn] smart LP hold: no vault matched its reported TVL (${ready.length} positions read)`);
  }
}

async function enrichVersusHold(smartLp, { rpc, blockTime, ethPriceUsd, tokenPrices = {}, lookbackDays = 7 } = {}) {
  const vaults = smartLp?.vaults || [];
  if (!vaults.length || !rpc) return smartLp;
  const tokenSet = new Set();
  for (const v of vaults) {
    if (v.token0) tokenSet.add(String(v.token0).toLowerCase());
    if (v.token1) tokenSet.add(String(v.token1).toLowerCase());
  }
  const prices = await hydrateDexPrices([...tokenSet], tokenPrices, ethPriceUsd);
  const decimals = await decimalsOf(rpc, [...tokenSet]);
  const pxOf = (token) => quoteUsd(token, ethPriceUsd, prices);
  await attachVersusHold(vaults, { rpc, blockTime, lookbackDays, decimals, pxOf });
  return smartLp;
}

module.exports = {
  fetchSmartLps,
  fromGgIndex,
  enrichVersusHold,
  WETH,
  USDG,
  TOPIC_FEES_COLLECTED,
};
