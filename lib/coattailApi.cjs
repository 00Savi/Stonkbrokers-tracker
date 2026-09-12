// Coattail's public read API: https://www.coattail.cash/api
// Cached up to an hour. Chain is source of truth for real-time.

const { utcIsoFromTs } = require("./dates.cjs");

const API = "https://www.coattail.cash";

function dayLabel(tsSec) {
  const d = new Date(Number(tsSec) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return utcIsoFromTs(tsSec);
}

async function getJson(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`coattail api ${path} -> ${res.status}`);
  return res.json();
}

function dailyFromPurchases(events, names) {
  const byDay = new Map();
  for (const row of events || []) {
    const ts = Number(row?.[1]);
    const usd = Number(row?.[2]) || 0;
    const idx = Number(row?.[3]);
    const label = dayLabel(ts);
    if (!label || !(usd > 0)) continue;
    if (!byDay.has(label)) byDay.set(label, { usd: 0, ts, bySymbol: {} });
    const rec = byDay.get(label);
    rec.usd += usd;
    rec.ts = Math.max(rec.ts, ts);
    const sym = names?.[idx] || `s${idx}`;
    rec.bySymbol[sym] = (rec.bySymbol[sym] || 0) + usd;
  }
  const days = [...byDay.entries()].sort((a, b) => a[1].ts - b[1].ts);
  return {
    labels: days.map(([d]) => d),
    values: days.map(([, r]) => r.usd),
  };
}

function activationHistory(events) {
  const byDay = new Map();
  let active = 0;
  const sorted = [...(events || [])].sort((a, b) => Number(a[1]) - Number(b[1]));
  for (const row of sorted) {
    const ts = Number(row?.[1]);
    const kind = Number(row?.[3]);
    const label = dayLabel(ts);
    if (!label) continue;
    if (!byDay.has(label)) {
      byDay.set(label, { ts, activations: 0, deactivations: 0 });
    }
    const rec = byDay.get(label);
    rec.ts = ts;
    if (kind === 1) {
      rec.activations += 1;
      active += 1;
    } else {
      rec.deactivations += 1;
      active = Math.max(0, active - 1);
    }
    rec.cumulative = active;
  }
  const days = [...byDay.entries()].sort((a, b) => a[1].ts - b[1].ts);
  return {
    labels: days.map(([d]) => d),
    dailyActivations: days.map(([, r]) => r.activations),
    dailyDeactivations: days.map(([, r]) => r.deactivations),
    cumulative: days.map(([, r]) => r.cumulative || 0),
  };
}

async function fetchGeckoPriceUsd(address) {
  if (!address) return 0;
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${address}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return 0;
    const px = Number((await res.json())?.data?.attributes?.price_usd);
    return px > 0 ? px : 0;
  } catch {
    return 0;
  }
}

async function fetchCoattailStats() {
  const payload = await getJson("/api/stats");
  const act = payload?.activations?.totals || {};
  const score = payload?.scorecard || {};
  const totals = score.totals || {};
  const names = score.names || score.symbols || [];
  const purchases = dailyFromPurchases(score.events, names);
  const firstTs = Array.isArray(score.events) && score.events.length
    ? Number(score.events[0]?.[1]) || 0
    : 0;
  const days = firstTs > 0 ? Math.max(1, (Date.now() / 1000 - firstTs) / 86400) : 1;
  const spent = Number(totals.usdSpent) || 0;
  const value = Number(totals.value) || 0;
  const last7 = purchases.values.slice(-7).reduce((s, v) => s + v, 0);
  const last1 = purchases.values.slice(-1).reduce((s, v) => s + v, 0);
  return {
    generatedAt: payload.generatedAt || score.generatedAt || null,
    activeNow: Number(act.activeNow) || 0,
    activations: Number(act.activations) || 0,
    deactivations: Number(act.deactivations) || 0,
    activationBurnCoat: Number(act.burned) || 0,
    purchases: Number(score.purchases) || (score.events || []).length,
    symbols: score.symbols || names,
    usdSpent: spent,
    basketValue: value,
    pnlUsd: Number(totals.pnlUsd) || 0,
    pnlPct: Number(totals.pnlPct) || 0,
    daysLive: days,
    annualizedPurchases: spent > 0 ? (spent / days) * 365 : last7 * (365 / 7),
    fees24h: last1,
    fees7d: last7,
    dailyDates: purchases.labels.slice(-30),
    dailyPurchases: purchases.values.slice(-30),
    benchmarks: score.benchmarks || null,
    history: activationHistory(payload?.activations?.events),
  };
}

module.exports = { fetchCoattailStats, fetchGeckoPriceUsd };
