// Pair Tokens — one ERC-20 per full-range Uniswap v4 position.
//
// PairTokenFactory.create clones a vault. compound() collects the position's
// swap fees, carves protocolFeeBps (live 1000 = 10%) to PairTokenFeeManager,
// and folds the rest back into the position. The fee manager splits that
// carve 50/50 to Clock In 3.0 and the STONKBROKER buyback. That skim is its
// own revenue book. It is not the Safety Deposit Box Smart LP skim.

const { ethers } = require("ethers");
const { decodeUint } = require("./rpc.cjs");
const { decimalsOf } = require("./chain.cjs");
const dates = require("./dates.cjs");

const SITE = "https://stonkbrokers.io/pairs";
const FACTORY = "0x282c4815f30abc1d0a8eb810c7309140d35a5b38";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const ZERO = "0x0000000000000000000000000000000000000000";
const TOPIC_COMPOUNDED = ethers.id("Compounded(uint256,uint256,uint256,uint256,uint128)");

const FACE = new ethers.Interface([
  "function allPairsLength() view returns (uint256)",
  "function allPairs(uint256) view returns (address)",
  "function protocolFeeBps() view returns (uint16)",
  "function symbol() view returns (string)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function basket() view returns (uint256 reserve0, uint256 reserve1)",
]);

function asUsd(raw, decimals, px) {
  if (raw == null || !(px > 0)) return 0;
  const n = Number(raw) / 10 ** decimals;
  return Number.isFinite(n) && n > 0 ? n * px : 0;
}

function quoteUsd(token, ethUsd, tokenPrices) {
  const t = String(token || "").toLowerCase();
  if (!t || t === ZERO) return Number(ethUsd) || 0;
  if (t === WETH) return Number(ethUsd) || 0;
  if (t === USDG) return 1;
  return Number(tokenPrices?.[t]) || 0;
}

async function hydrateDexPrices(tokens, tokenPrices, ethUsd) {
  const prices = { ...(tokenPrices || {}) };
  const missing = [...new Set(tokens.map((t) => String(t || "").toLowerCase()))]
    .filter((t) => t && t !== ZERO && t.startsWith("0x") && !(quoteUsd(t, ethUsd, prices) > 0));
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
      console.warn(`[warn] pair token dex prices: ${e.message}`);
    }
  }
  return prices;
}

function decodeStr(hex) {
  if (!hex || hex === "0x") return "";
  try {
    return FACE.decodeFunctionResult("symbol", hex)[0] || "";
  } catch {
    return "";
  }
}

function decodeAddrWord(hex) {
  if (!hex || hex === "0x" || hex.length < 66) return null;
  return ("0x" + hex.slice(-40)).toLowerCase();
}

function emptyResult(lookbackDays) {
  const windowStart = dates.utcMidnightSec() - (lookbackDays - 1) * 86400;
  return {
    pairs: [],
    count: 0,
    totalTvlUsd: 0,
    fees7dUsd: 0,
    protocolFees7dUsd: 0,
    daily: Array(lookbackDays).fill(0),
    dailyGross: Array(lookbackDays).fill(0),
    dailyDates: Array.from({ length: lookbackDays }, (_, i) => dates.utcIsoFromTs(windowStart + i * 86400)),
    protocolFeeBps: null,
    feeWalkOk: false,
    feeSplit: {
      buybackBps: 5000,
      boosterBps: 5000,
      note: "10% of compounded LP fees. PairTokenFeeManager splits that carve 50/50 to Clock In 3.0 and the STONKBROKER buyback. This is not the Smart LP skim.",
    },
    site: SITE,
  };
}

async function listPairs(rpc) {
  const lenHex = await rpc.calls([{ to: FACTORY, data: FACE.getFunction("allPairsLength").selector }]);
  const n = Number(decodeUint(lenHex[0]) || 0n);
  if (!(n > 0) || n > 500) return [];
  const calls = [];
  for (let i = 0; i < n; i++) calls.push({ to: FACTORY, data: FACE.encodeFunctionData("allPairs", [i]) });
  const raw = await rpc.calls(calls);
  const out = [];
  for (const hex of raw) {
    const ca = decodeAddrWord(hex);
    if (ca && ca !== ZERO) out.push(ca);
  }
  return out;
}

async function fetchPairTokens({
  rpc,
  blockTime,
  ethPriceUsd,
  tokenPrices = {},
  lookbackDays = 7,
} = {}) {
  const empty = emptyResult(lookbackDays);
  if (!rpc || !blockTime) return empty;

  const fromBlock = blockTime.blockAt(dates.utcMidnightSec() - (lookbackDays - 1) * 86400) || 0;
  let toBlock = 0;
  try {
    toBlock = await rpc.blockNumber();
  } catch {
    return empty;
  }
  if (!(fromBlock && toBlock && toBlock > fromBlock)) return empty;

  let cas = [];
  try {
    cas = await listPairs(rpc);
  } catch (e) {
    console.warn(`[warn] pair tokens: factory read failed: ${e.message}`);
    return empty;
  }
  if (!cas.length) return empty;

  const bpsHex = await rpc.calls([{ to: FACTORY, data: FACE.getFunction("protocolFeeBps").selector }]);
  const protocolFeeBps = decodeUint(bpsHex[0]) == null ? null : Number(decodeUint(bpsHex[0]));

  const metaCalls = [];
  for (const ca of cas) {
    metaCalls.push({ to: ca, data: FACE.getFunction("symbol").selector });
    metaCalls.push({ to: ca, data: FACE.getFunction("token0").selector });
    metaCalls.push({ to: ca, data: FACE.getFunction("token1").selector });
    metaCalls.push({ to: ca, data: FACE.getFunction("basket").selector });
  }
  const meta = await rpc.calls(metaCalls);

  const pairs = [];
  const tokenSet = new Set();
  cas.forEach((ca, i) => {
    const o = i * 4;
    const token0 = decodeAddrWord(meta[o + 1]);
    const token1 = decodeAddrWord(meta[o + 2]);
    const reserve0 = decodeUint(meta[o + 3], 0);
    const reserve1 = decodeUint(meta[o + 3], 1);
    if (token0 && token0 !== ZERO) tokenSet.add(token0);
    if (token1 && token1 !== ZERO) tokenSet.add(token1);
    pairs.push({
      ca,
      symbol: decodeStr(meta[o]) || ca.slice(0, 8),
      token0,
      token1,
      reserve0,
      reserve1,
      fees7dUsd: 0,
      protocolFees7dUsd: 0,
    });
  });

  const symCalls = [...tokenSet].map((t) => ({ to: t, data: FACE.getFunction("symbol").selector }));
  const symRaw = symCalls.length ? await rpc.calls(symCalls) : [];
  const symbols = new Map();
  [...tokenSet].forEach((t, i) => {
    symbols.set(t, decodeStr(symRaw[i]) || t.slice(0, 6));
  });

  const prices = await hydrateDexPrices([...tokenSet], tokenPrices, ethPriceUsd);
  const decimals = await decimalsOf(rpc, [...tokenSet]);
  const pxOf = (token) => quoteUsd(token, ethPriceUsd, prices);
  const decOf = (token) => (token && token !== ZERO ? (decimals.get(token) ?? 18) : 18);
  const labelOf = (token) => (!token || token === ZERO ? "ETH" : (symbols.get(token) || "—"));

  for (const p of pairs) {
    p.symbol0 = labelOf(p.token0);
    p.symbol1 = labelOf(p.token1);
    const leg0 = asUsd(p.reserve0, decOf(p.token0), pxOf(p.token0));
    const leg1 = asUsd(p.reserve1, decOf(p.token1), pxOf(p.token1));
    p.tvlUsd = +((leg0 || 0) + (leg1 || 0)).toFixed(2);
    delete p.reserve0;
    delete p.reserve1;
  }

  let logs = [];
  let feeWalkOk = false;
  try {
    for (let i = 0; i < cas.length; i += 25) {
      const chunk = cas.slice(i, i + 25);
      const part = await rpc.getLogs({
        address: chunk,
        fromBlock,
        toBlock,
        topics: [TOPIC_COMPOUNDED],
      });
      logs.push(...part);
    }
    feeWalkOk = true;
    process.stdout.write(`\r    pair tokens: ${cas.length} pairs, ${logs.length} compounds`.padEnd(70) + "\n");
  } catch (e) {
    console.warn(`[warn] pair token Compounded walk failed: ${e.message}`);
  }

  const byCa = new Map(pairs.map((p) => [p.ca, p]));
  const daily = Array(lookbackDays).fill(0);
  const dailyGross = Array(lookbackDays).fill(0);
  const windowStart = dates.utcMidnightSec() - (lookbackDays - 1) * 86400;
  let feesGenerated = 0;
  let protocolFees = 0;

  for (const log of logs) {
    const p = byCa.get(String(log.address || "").toLowerCase());
    if (!p) continue;
    const fees0 = decodeUint(log.data, 0);
    const fees1 = decodeUint(log.data, 1);
    const protocol0 = decodeUint(log.data, 2);
    const protocol1 = decodeUint(log.data, 3);
    const generated =
      asUsd(fees0, decOf(p.token0), pxOf(p.token0)) +
      asUsd(fees1, decOf(p.token1), pxOf(p.token1));
    const skim =
      asUsd(protocol0, decOf(p.token0), pxOf(p.token0)) +
      asUsd(protocol1, decOf(p.token1), pxOf(p.token1));
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
    p.fees7dUsd += generated;
    p.protocolFees7dUsd += skim;
  }

  for (const p of pairs) {
    p.fees7dUsd = +Number(p.fees7dUsd).toFixed(2);
    p.protocolFees7dUsd = +Number(p.protocolFees7dUsd).toFixed(2);
  }
  pairs.sort((a, b) => (b.protocolFees7dUsd || 0) - (a.protocolFees7dUsd || 0) || (b.tvlUsd || 0) - (a.tvlUsd || 0));

  return {
    ...empty,
    pairs,
    count: pairs.length,
    totalTvlUsd: +pairs.reduce((s, p) => s + (p.tvlUsd || 0), 0).toFixed(2),
    fees7dUsd: +feesGenerated.toFixed(2),
    protocolFees7dUsd: +protocolFees.toFixed(2),
    daily: daily.map((v) => +v.toFixed(2)),
    dailyGross: dailyGross.map((v) => +v.toFixed(2)),
    protocolFeeBps,
    feeWalkOk,
  };
}

module.exports = {
  fetchPairTokens,
  FACTORY,
  SITE,
};
