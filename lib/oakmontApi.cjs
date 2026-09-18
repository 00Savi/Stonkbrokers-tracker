// Oakmont's public indexer: https://api.oakmontvault.xyz
// The dapp's "Reserve Holder APY" is the annualized growth of the
// STRIKE-per-RESERVE exchange rate above 1.0, from the first history
// sample (minus one hour) to the latest sample.

const { utcIsoFromTs } = require("./dates.cjs");

const API = "https://api.oakmontvault.xyz";
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const SEL = {
  convertToAssets: "0x07a2d13a",
  totalAssets: "0x01e1d114",
  totalSupply: "0x18160ddd",
};
// Indexer history used (rate-1) annualized from the first sample. The last
// good sample on 9/2 implied that origin (~23 days earlier).
const RATE_ORIGIN_MS = Date.parse("2026-08-10T00:00:00.000Z");

function fromWei(v) {
  if (v === undefined || v === null || v === "") return 0;
  try {
    return Number(BigInt(v)) / 1e18;
  } catch {
    return Number(v) / 1e18 || 0;
  }
}

async function getJson(path) {
  const res = await fetch(`${API}/api${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`oakmont api ${path} -> ${res.status}`);
  return res.json();
}

function claimApyPct(history) {
  const rows = (history || [])
    .filter((r) => r?.exchangeRate && r?.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!rows.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const rate = fromWei(last.exchangeRate);
  const start = new Date(first.timestamp).getTime() - 3_600_000;
  const end = new Date(last.timestamp).getTime();
  if (!(rate > 0) || !(end > start)) return null;
  return ((rate - 1) * 100) / ((end - start) / 86_400_000) * 365;
}

function compactHistory(history, max = 40) {
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) return [];
  const picked = [];
  if (rows.length <= max) {
    picked.push(...rows);
  } else {
    const step = Math.ceil(rows.length / max);
    for (let i = 0; i < rows.length; i += step) picked.push(rows[i]);
    const last = rows[rows.length - 1];
    if (picked[picked.length - 1] !== last) picked.push(last);
  }
  return picked.map((r) => ({
    ts: r.timestamp,
    date: utcIsoFromTs(r.timestamp),
    exchangeRate: fromWei(r.exchangeRate),
    nav: fromWei(r.totalValue),
    reservePrice: fromWei(r.reservePrice),
  }));
}

async function ethCall(to, data) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  if (j.error || !j.result || j.result === "0x") return null;
  try {
    return BigInt(j.result);
  } catch {
    return null;
  }
}

function padUint(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

/** ERC-4626 wrap: $RESERVE.asset() is $STRIKE; convertToAssets is STRIKE per RESERVE. */
async function fetchOakmontOnchain(reserveCa) {
  const one = 10n ** 18n;
  const [rateWei, assetsWei, supplyWei] = await Promise.all([
    ethCall(reserveCa, SEL.convertToAssets + padUint(one)),
    ethCall(reserveCa, SEL.totalAssets),
    ethCall(reserveCa, SEL.totalSupply),
  ]);
  if (rateWei == null || assetsWei == null || supplyWei == null) {
    throw new Error("oakmont on-chain convertToAssets/totalAssets failed");
  }
  const exchangeRate = Number(rateWei) / 1e18;
  const nowIso = new Date().toISOString();
  return {
    exchangeRate,
    vaultNavUsdg: 0,
    reservePriceUsdg: 0,
    soakSupply: Number(supplyWei) / 1e18,
    oakSupply: Number(assetsWei) / 1e18,
    wraps24h: 0,
    unwraps24h: 0,
    claimApyPct: claimApyPct([
      { timestamp: new Date(RATE_ORIGIN_MS).toISOString(), exchangeRate: (10n ** 18n).toString() },
      { timestamp: nowIso, exchangeRate: rateWei.toString() },
    ]),
    ethFeesAll: 0,
    feeDays: 0,
    history: [{ ts: nowIso, date: nowIso.slice(0, 10), exchangeRate, nav: 0, reservePrice: 0 }],
    revenue: [],
    source: "onchain-erc4626",
  };
}

async function fetchOakmontVault(reserveCa) {
  try {
  const [stats, history, revenue] = await Promise.all([
    getJson("/vault/stats"),
    getJson("/vault/history?period=all"),
    getJson("/vault/revenue?period=all"),
  ]);
  const hist = Array.isArray(history?.data) ? history.data : [];
  const rev = Array.isArray(revenue?.data) ? revenue.data : [];
  const ethFees = rev.reduce((s, r) => s + fromWei(r.ethFeeRevenue), 0);
  const firstRev = rev[0]?.timestamp ? new Date(rev[0].timestamp).getTime() : 0;
  const days = firstRev > 0 ? Math.max(1, (Date.now() - firstRev) / 86_400_000) : 0;
  return {
    exchangeRate: fromWei(stats.exchangeRate),
    vaultNavUsdg: fromWei(stats.totalVaultValue),
    reservePriceUsdg: fromWei(stats.reservePrice),
    soakSupply: fromWei(stats.soakSupply),
    oakSupply: fromWei(stats.oakSupply),
    wraps24h: Number(stats.volume24h?.wraps || 0),
    unwraps24h: Number(stats.volume24h?.unwraps || 0),
    claimApyPct: claimApyPct(hist),
    ethFeesAll: ethFees,
    feeDays: days,
    history: compactHistory(hist),
    revenue: rev.map((r) => ({
      date: String(r.timestamp || "").slice(0, 10),
      eth: fromWei(r.ethFeeRevenue),
      reserveBurned: fromWei(r.shareBurnRevenue),
    })),
    source: "oakmont-api",
  };
  } catch (e) {
    if (!reserveCa) throw e;
    console.warn(`[warn] oakmont vault api: ${e.message}; falling back to on-chain ERC-4626`);
    return fetchOakmontOnchain(reserveCa);
  }
}

async function fetchGeckoHolders(address) {
  if (!address) return null;
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${address}/info`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return null;
  const n = (await res.json())?.data?.attributes?.holders?.count;
  return typeof n === "number" && n > 0 ? n : null;
}

module.exports = { fetchOakmontVault, fetchOakmontOnchain, claimApyPct, fromWei, fetchGeckoHolders };
