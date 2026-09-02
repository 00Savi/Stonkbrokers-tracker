// Oakmont's public indexer: https://api.oakmontvault.xyz
// The dapp's "Reserve Holder APY" is the annualized growth of the
// STRIKE-per-RESERVE exchange rate above 1.0, from the first history
// sample (minus one hour) to the latest sample.

const API = "https://api.oakmontvault.xyz";

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
    date: new Date(r.timestamp).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
    exchangeRate: fromWei(r.exchangeRate),
    nav: fromWei(r.totalValue),
    reservePrice: fromWei(r.reservePrice),
  }));
}

async function fetchOakmontVault() {
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
      date: r.timestamp,
      eth: fromWei(r.ethFeeRevenue),
      reserveBurned: fromWei(r.shareBurnRevenue),
    })),
  };
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

module.exports = { fetchOakmontVault, claimApyPct, fromWei, fetchGeckoHolders };
